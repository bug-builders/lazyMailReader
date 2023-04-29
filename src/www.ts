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
import { readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

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
					let slackClient: WebClient | undefined;
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

						const storePath = join(
							services.config.userInformationDirectory,
							`/${team}.json`,
						);
						const botInstallation: bolt.Installation = JSON.parse(
							readFileSync(storePath, "utf-8"),
						);

						const botToken = botInstallation.bot?.token;
						assertExists(botToken, "botToken");

						const authenticatedApp = new bolt.App({
							signingSecret: services.config.SLACK_SIGNING_SECRET,
							token: botToken,
						});
						slackClient = authenticatedApp.client;

						await slackClient.chat.postMessage({
							token: botToken,
							text: "Parfait, j'ai tout ce qu'il me faut !\nLaisse moi quelques minutes pour lire tes mails et je reviens vers toi dès que je suis prêt...",
							channel,
						});

						const { documents, ts } = await downloadEmails(services, {
							channel,
							slackClient,
							team,
							tokens,
							user,
						});

						const { ts: currentTs } = await indexEmails(services, {
							channel,
							documents,
							slackClient,
							team,
							user,
							ts,
						});

						await postOrUpdateMessage({
							ts: currentTs,
							channel,
							slackClient,
							text: "Et bien je crois que j'ai tout lu... Que souhaiterais tu savoir?",
						});
					} catch (error) {
						console.error(error);
						if (channel && slackClient) {
							await postOrUpdateMessage({
								channel,
								slackClient,
								text: "Je suis désolé, quelque chose s'est mal passé... Je vais contacter le support pour savoir ce qu'il s'est passé",
							});
						}
					}
				},
			),
		},
	],
	clientId: services.config.SLACK_CLIENT_ID,
	clientSecret: services.config.SLACK_CLIENT_SECRET,
	stateSecret: services.config.SLACK_STATE_SECRET_KEY,
	signingSecret: services.config.SLACK_SIGNING_SECRET,
	scopes: ["chat:write", "im:history", "users.profile:read"],
	installationStore: {
		storeInstallation: async (installation) => {
			if (installation.team !== undefined) {
				const storePath = join(
					services.config.userInformationDirectory,
					`/${installation.team.id}.json`,
				);
				writeFileSync(storePath, JSON.stringify(installation), "utf-8");
				return;
			}
			throw new Error("Failed saving installation data to installationStore");
		},
		fetchInstallation: async (installQuery) => {
			if (installQuery.teamId !== undefined) {
				const storePath = join(
					services.config.userInformationDirectory,
					`/${installQuery.teamId}.json`,
				);
				return JSON.parse(readFileSync(storePath, "utf-8"));
			}
			throw new Error("Failed fetching installation");
		},
		deleteInstallation: async (installQuery) => {
			if (installQuery.teamId !== undefined) {
				const storePath = join(
					services.config.userInformationDirectory,
					`/${installQuery.teamId}.json`,
				);
				return rmSync(storePath);
			}
			throw new Error("Failed to delete installation");
		},
	},
});

app.event("app_home_opened", async ({ context, client, event }) => {
	assertExists(context.teamId, "context.teamId");

	const userInformation = retrieveUserInformation(services, {
		team: context.teamId,
		user: event.user,
	});

	const count = await services.lazyMailVectorStore.countDocuments({
		userId: `${context.teamId}-${event.user}`,
	});

	const syncEmailBlock: (bolt.Block | bolt.KnownBlock)[] =
		userInformation.lastEmailsDownloadedAt
			? [
					{
						type: "section",
						block_id: "sync_text",
						text: {
							type: "mrkdwn",
							text: `Dernière synchronisation des emails: ${new Date(
								userInformation.lastEmailsDownloadedAt,
							).toLocaleDateString()}`,
						},
					},
					{
						type: "actions",
						block_id: "sync_button",
						elements: [
							{
								type: "button",
								text: {
									type: "plain_text",
									text: "Synchroniser",
								},
								action_id: "sync_emails",
							},
						],
					},
			  ]
			: [];

	await client.views.publish({
		user_id: event.user,
		view: {
			type: "home",
			blocks: [
				{
					type: "section",
					block_id: "welcome",
					text: {
						type: "mrkdwn",
						text: `:wave: *Bonjour, <@${event.user}>!*${
							count > 0 ? `\nJ'ai en mémoire ${count} de tes emails.` : ""
						}`,
					},
				},
				{
					type: "divider",
				},
				{
					type: "section",
					block_id: "setup_status_openai",
					text: {
						type: "mrkdwn",
						text: `*Clé OpenAI:* ${
							userInformation.openAIKey ? ":heavy_check_mark:" : ":x:"
						}`,
					},
				},
				{
					type: "section",
					block_id: "setup_status_emails",
					text: {
						type: "mrkdwn",
						text: `*Accès aux emails:* ${
							userInformation.accessToken ? ":heavy_check_mark:" : ":x:"
						}`,
					},
				},
				...syncEmailBlock,
			],
		},
	});
});

app.action("sync_emails", async ({ ack, client, context, body }) => {
	assertExists(context.teamId, "context.teamId");

	const userInformation = retrieveUserInformation(services, {
		team: context.teamId,
		user: body.user.id,
	});

	const { channel, accessToken, refreshToken } = userInformation;
	assertExists(channel, "channel");
	assertExists(accessToken, "accessToken");
	assertExists(refreshToken, "refreshToken");

	await ack();

	await postOrUpdateMessage({
		channel,
		slackClient: client,
		text: "Très bien, je vais aller lire tes derniers emails...",
	});

	const { documents, ts } = await downloadEmails(services, {
		channel,
		slackClient: client,
		team: context.teamId,
		tokens: { accessToken, refreshToken },
		user: body.user.id,
	});

	const { ts: currentTs } = await indexEmails(services, {
		channel,
		documents,
		slackClient: client,
		team: context.teamId,
		user: body.user.id,
		ts,
	});

	await postOrUpdateMessage({
		ts: currentTs,
		channel,
		slackClient: client,
		text: "Et voilà... Que souhaiterais tu savoir?",
	});
});

app.message(async ({ message, client }) => {
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

	if (!userInformation.displayName || !userInformation.channel) {
		const { profile } = await client.users.profile.get({ user });
		userInformation.displayName = profile?.display_name;
		userInformation.channel = channel;
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
			channel,
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
