import {
	UserInformation,
	retrieveUserInformation,
	saveUserInformation,
} from "./data-accessors/user-information.js";
import { wrapHandleOauthCallback } from "./document_loaders/web/gmail_utils/handOauthCallback.js";
import { downloadEmails } from "./steps/downloadEmails.js";
import { handleOpenAIKeyRetrieval } from "./steps/handleOpenAIKeyRetrieval.js";
import { handleQuestion } from "./steps/handleQuestion.js";
import { indexEmails } from "./steps/indexEmails.js";
import { setupBot } from "./steps/setupBot.js";
import { verify } from "./utils/basicCrypto.js";
import { postOrUpdateMessage } from "./utils/postOrUpdateMessage.js";
import { setupServices } from "./utils/setupServices.js";
import { assertExists, assertIsString } from "./utils/typing.js";
import bolt from "@slack/bolt";

export type WebClient = typeof app.client;

const services = setupServices();

const app = new bolt.App({
	customRoutes: [
		{
			method: "GET",
			path: "/oauth2callback",
			handler: wrapHandleOauthCallback(
				services.googleOauth2Client,
				async (tokens, state) => {
					let channel: string | undefined;
					try {
						assertExists(state, "state");
						const {
							team,
							user,
							channel: verifiedChannel,
						} = verify(services.config.SECRET_KEY, state);
						assertIsString(team);
						assertIsString(user);
						assertIsString(verifiedChannel);
						channel = verifiedChannel;
						const userInformation = retrieveUserInformation(services, {
							team,
							user,
						});
						assertExists(userInformation, "userInformation");

						userInformation.accessToken = tokens.accessToken;
						userInformation.refreshToken = tokens.refreshToken;
						saveUserInformation(services, { team, user, userInformation });
						await app.client.chat.postMessage({
							text: "Parfait, j'ai tout ce qu'il me faut !\nLaisse moi quelques minutes pour lire tes mails et je reviens vers toi dès que je suis prêt...",
							channel,
						});

						const { documents, ts } = await downloadEmails(services, {
							channel,
							slackClient: app.client,
							team,
							tokens,
							user,
						});

						const { ts: currentTs } = await indexEmails(services, {
							channel,
							documents,
							slackClient: app.client,
							team,
							user,
							ts,
						});

						await postOrUpdateMessage({
							ts: currentTs,
							channel,
							slackClient: app.client,
							text: "Et bien je crois que j'ai tout lu... Que souhaiterais tu savoir?",
						});
					} catch (error) {
						console.error(error);
						if (channel) {
							await postOrUpdateMessage({
								channel,
								slackClient: app.client,
								text: "Je suis désolé, quelque chose s'est mal passé... Je vais contacter le support pour savoir ce qu'il s'est passé",
							});
						}
					}
				},
			),
		},
	],
	signingSecret: services.config.SLACK_SIGNING_SECRET,
	token: services.config.SLACK_BOT_TOKEN,
});

app.message(async ({ message, say, client }) => {
	if (message.subtype) {
		return;
	}

	const {
		team,
		user,
		text,
		channel,
		thread_ts: threadTs,
		ts: userMessageTs,
	} = message as unknown as {
		team: string;
		channel: string;
		user: string;
		text: string;
		thread_ts?: string;
		ts: string;
	};

	assertIsString(channel);
	assertIsString(team);
	assertIsString(user);

	const userInformation: UserInformation =
		retrieveUserInformation(services, { team, user }) ?? {};

	if (!userInformation.displayName) {
		const { profile } = await client.users.profile.get({ user });
		userInformation.displayName = profile?.display_name;
		saveUserInformation(services, { team, user, userInformation });
	}

	if (!userInformation.openAIKey) {
		assertExists(userInformation.displayName, "userInformation.displayName");
		const openAiKey = await handleOpenAIKeyRetrieval({
			slackClient: client,
			channel,
			text,
			displayName: userInformation.displayName,
		});
		userInformation.openAIKey = openAiKey ?? undefined;

		saveUserInformation(services, { team, user, userInformation });
	}

	const setupCompleted = await setupBot(services, {
		user,
		team,
		channel,
		slackClient: client,
	});

	if (!setupCompleted) {
		return;
	}

	const {
		accessToken,
		displayName,
		emailAddress,
		lastEmailsDownloadedAt,
		lastIndexationDoneAt,
		openAIKey,
		refreshToken,
	} = userInformation;

	assertExists(accessToken, "accessToken");
	assertExists(refreshToken, "refreshToken");
	assertExists(displayName, "displayName");
	assertExists(emailAddress, "emailAddress");
	assertExists(lastEmailsDownloadedAt, "lastEmailsDownloadedAt");
	assertExists(lastIndexationDoneAt, "lastIndexationDoneAt");
	assertExists(openAIKey, "openAIKey");

	await handleQuestion(services, {
		team,
		user,
		channel,
		threadTs: threadTs ?? userMessageTs,
		question: text,
		slackClient: client,
		userInformation: {
			accessToken,
			displayName,
			emailAddress,
			lastEmailsDownloadedAt,
			lastIndexationDoneAt,
			openAIKey,
			refreshToken,
		},
	});
});

(async () => {
	// Start the app
	const server = await app.start(3334);

	console.log("⚡️ Bolt app is running!");
})();
