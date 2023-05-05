import {
	UserInformation,
	deleteUserInformation,
	retrieveUserInformation,
	saveUserInformation,
} from "./data-accessors/user-information.js";
import { wrapHandleOauthCallback } from "./document_loaders/web/utils/wrapHandleOauthCallback.js";
import { selectLang } from "./i18n/index.js";
import { downloadEmails } from "./steps/downloadEmails.js";
import { handleOauthCallback } from "./steps/handleOauthCallback.js";
import { handleOpenAIKeyRetrieval } from "./steps/handleOpenAIKeyRetrieval.js";
import { handleQuestion } from "./steps/handleQuestion.js";
import { indexEmails } from "./steps/indexEmails.js";
import { setupBot } from "./steps/setupBot.js";
import { handleSubscriptionCreated } from "./stripe/handleSubscriptionCreated.js";
import { handleSubscriptionDeleted } from "./stripe/handleSubscriptionDeleted.js";
import { handleSubscriptionUpdated } from "./stripe/handleSubscriptionUpdated.js";
import { FREE_TRIAL_QUERY_COUNT } from "./utils/constant.js";
import { generateOnePageRouteHandlers } from "./utils/onePageRoute.js";
import { postOrUpdateMessage } from "./utils/postOrUpdateMessage.js";
import { setupServices } from "./utils/setupServices.js";
import { assertExists, assertIsLang, assertIsString } from "./utils/typing.js";
import bolt from "@slack/bolt";
import { readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

export type WebClient = typeof app.client;

const services = setupServices();

const app = new bolt.App({
	installerOptions: {
		stateVerification: false,
	},
	customRoutes: [
		...generateOnePageRouteHandlers(services),
		{
			method: "POST",
			path: "/stripe",
			handler: async (req, res) => {
				try {
					const sig = res.req.headers["stripe-signature"];
					assertExists(sig, "sig");

					const body = await new Promise<string>((resolve, reject) => {
						let data = "";
						res.req.on("data", (chunk) => {
							data += chunk;
						});
						res.req.on("end", () => {
							resolve(data);
						});
						res.req.on("error", reject);
					});

					const event = services.stripeClient.webhooks.constructEvent(
						body,
						sig,
						services.config.STRIPE_WEBHOOK_SECRET,
					);

					switch (event.type) {
						case "customer.subscription.created": {
							await handleSubscriptionCreated(services, { event });
							break;
						}
						case "customer.subscription.updated": {
							await handleSubscriptionUpdated(services, { event });
						}
						case "customer.subscription.deleted": {
							await handleSubscriptionDeleted(services, { event });
							break;
						}
					}
					res.statusCode = 200;
					res.end("ok");
					return;
				} catch (error) {
					console.error("Error stripe webhook:", error);
					res.statusCode = 500;
					res.setHeader("Content-Type", "text/plain");
					res.end(
						`Error getting tokens: ${error}. Check the console for more information.\n`,
					);
				}
			},
		},
		{
			method: "GET",
			path: "/oauth2callback",
			handler: wrapHandleOauthCallback({
				services,
				pathname: "/oauth2callback",
				staticHtmlAnswer: readFileSync(
					join(services.config.ONE_PAGE_DIRECTORY, "/close.html"),
					"utf-8",
				),
				codeToTokens: (code) => services.gmailLoader.codeToTokens(code),
				callback: handleOauthCallback,
			}),
		},
		{
			method: "GET",
			path: "/ms-oauth2callback",
			handler: wrapHandleOauthCallback({
				services,
				pathname: "/ms-oauth2callback",
				staticHtmlAnswer: readFileSync(
					join(services.config.ONE_PAGE_DIRECTORY, "/close.html"),
					"utf-8",
				),
				codeToTokens: (code) => services.msLoader.codeToTokens(code),
				callback: handleOauthCallback,
			}),
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
		userInformation.accessToken && userInformation.refreshToken
			? [
					{
						type: "section",
						block_id: "sync_text",
						text: {
							type: "mrkdwn",
							text: userInformation.lastEmailsDownloadedAt
								? selectLang(userInformation.lang).lastSyncTime.replace(
										"{date}",
										new Date(
											userInformation.lastEmailsDownloadedAt,
										).toLocaleString(
											userInformation.lang === "en" ? "en-US" : "fr-FR",
										),
								  )
								: selectLang(userInformation.lang).emailNotSync,
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
									text: selectLang(userInformation.lang).synchronize,
								},
								action_id: "sync_emails",
							},
							{
								type: "button",
								text: {
									type: "plain_text",
									text: selectLang(userInformation.lang).deleteData,
								},
								action_id: "delete_emails",
							},
						],
					},
			  ]
			: [];

	const stripePortalBlock: (bolt.Block | bolt.KnownBlock)[] =
		userInformation.stripeCustomerId
			? [
					{
						type: "section",
						block_id: "stripe_text",
						text: {
							type: "mrkdwn",
							text: selectLang(userInformation.lang).stripeAccess.replace(
								"{stripe_portal}",
								services.config.STRIPE_CUSTOMER_PORTAL,
							),
						},
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
					block_id: "change_lang",
					text: {
						type: "mrkdwn",
						text: selectLang(userInformation.lang).lang,
					},
					accessory: {
						type: "static_select",
						placeholder: {
							type: "plain_text",
							text: selectLang(userInformation.lang).changeLang,
							emoji: true,
						},
						options: [
							{
								text: {
									type: "plain_text",
									text: "Français",
									emoji: true,
								},
								value: "fr",
							},
							{
								text: {
									type: "plain_text",
									text: "English",
									emoji: true,
								},
								value: "en",
							},
						],
						action_id: "submit_lang",
					},
				},
				{
					type: "section",
					block_id: "welcome",
					text: {
						type: "mrkdwn",
						text: `:wave: *${selectLang(userInformation.lang).hello}, <@${
							event.user
						}>!*${
							count > 0
								? `\n${selectLang(userInformation.lang).countEmail.replace(
										"{count}",
										count.toString(),
								  )}`
								: ""
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
						text: `*${selectLang(userInformation.lang).openAIKey}:* ${
							userInformation.openAIKey ? ":heavy_check_mark:" : ":x:"
						}`,
					},
				},
				{
					type: "section",
					block_id: "setup_status_emails",
					text: {
						type: "mrkdwn",
						text: `*${selectLang(userInformation.lang).emailAccess}:* ${
							userInformation.accessToken ? ":heavy_check_mark:" : ":x:"
						}`,
					},
				},
				{
					type: "section",
					block_id: "setup_status_stripe",
					text: {
						type: "mrkdwn",
						text: `*Subscription Stripe:* ${
							userInformation.stripeSubscriptionStatus !== ""
								? userInformation.stripeSubscriptionStatus
								: ":x:"
						}`,
					},
				},
				...syncEmailBlock,
				...stripePortalBlock,
			],
		},
	});
});

app.action("submit_lang", async ({ ack, context, body, action }) => {
	assertExists(context.teamId, "context.teamId");
	await ack();
	const userInformation = retrieveUserInformation(services, {
		team: context.teamId,
		user: body.user.id,
	});
	if (action.type !== "static_select") {
		return;
	}
	assertIsLang(action.selected_option.value);

	userInformation.lang = action.selected_option.value;

	saveUserInformation(services, {
		team: context.teamId,
		user: body.user.id,
		userInformation,
	});
});

app.action("delete_emails", async ({ ack, client, context, body }) => {
	assertExists(context.teamId, "context.teamId");
	await ack();

	const userInformation = retrieveUserInformation(services, {
		team: context.teamId,
		user: body.user.id,
	});

	await services.lazyMailVectorStore.deleteDocuments({
		userId: `${context.teamId}-${body.user.id}`,
	});

	const emlPath = join(
		services.config.userInformationDirectory,
		`/${context.teamId}-${body.user.id}/eml-files`,
	);

	rmSync(emlPath, { recursive: true, force: true });
	deleteUserInformation(services, { user: body.user.id, team: context.teamId });

	if (userInformation.channel) {
		await postOrUpdateMessage({
			channel: userInformation.channel,
			slackClient: client,
			text: selectLang(userInformation.lang).allForgotten,
		});
	}
});

app.action("sync_emails", async ({ ack, client, context, body }) => {
	assertExists(context.teamId, "context.teamId");

	const userInformation = retrieveUserInformation(services, {
		team: context.teamId,
		user: body.user.id,
	});

	const { channel, accessToken, refreshToken, loaderType } = userInformation;
	assertExists(channel, "channel");
	assertExists(accessToken, "accessToken");
	assertExists(refreshToken, "refreshToken");
	assertExists(loaderType, "loaderType");

	await ack();

	await postOrUpdateMessage({
		channel,
		slackClient: client,
		text: selectLang(userInformation.lang).allForgotten,
	});

	const { documents, ts } = await downloadEmails(services, {
		channel,
		slackClient: client,
		team: context.teamId,
		tokens: { accessToken, refreshToken },
		loaderType,
		user: body.user.id,
		lang: userInformation.lang,
	});

	const { ts: currentTs } = await indexEmails(services, {
		channel,
		documents,
		slackClient: client,
		team: context.teamId,
		user: body.user.id,
		ts,
		lang: userInformation.lang,
	});

	await postOrUpdateMessage({
		ts: currentTs,
		channel,
		slackClient: client,
		text: selectLang(userInformation.lang).allGood,
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
			lang: userInformation.lang,
		});
		userInformation.openAIKey = openAiKey ?? undefined;

		saveUserInformation(services, { team, user, userInformation });
	}

	const setupCompleted = await setupBot(services, {
		user,
		team,
		channel,
		slackClient: client,
		lang: userInformation.lang,
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
		loaderType,
		queryCount: savedQueryCount,
		stripeCustomerId,
		stripeSubscriptionStatus,
		lang,
	} = userInformation;

	assertExists(accessToken, "accessToken");
	assertExists(refreshToken, "refreshToken");
	assertExists(displayName, "displayName");
	assertExists(emailAddress, "emailAddress");
	assertExists(lastEmailsDownloadedAt, "lastEmailsDownloadedAt");
	assertExists(lastIndexationDoneAt, "lastIndexationDoneAt");
	assertExists(openAIKey, "openAIKey");
	assertExists(loaderType, "loaderType");

	const lastQueryAt = new Date().toISOString();
	const queryCount = savedQueryCount ?? 0;

	if (
		(!stripeSubscriptionStatus ||
			!["trialing", "active"].includes(stripeSubscriptionStatus)) &&
		queryCount > FREE_TRIAL_QUERY_COUNT
	) {
		const subscriptionLink = new URL(services.config.STRIPE_SUBSCRIPTION_LINK);
		subscriptionLink.searchParams.set("prefilled_email", emailAddress);
		subscriptionLink.searchParams.set("client_reference_id", `${team}-${user}`);
		await postOrUpdateMessage({
			channel,
			slackClient: client,
			text: selectLang(userInformation.lang).timeToPay.replace(
				"{stripe_link}",
				subscriptionLink.toString,
			),
			threadTs,
		});
		return;
	}

	const finalUserInformation = {
		loaderType,
		lastQueryAt,
		channel,
		accessToken,
		displayName,
		emailAddress,
		lastEmailsDownloadedAt,
		lastIndexationDoneAt,
		openAIKey,
		refreshToken,
		queryCount,
		stripeCustomerId: stripeCustomerId ?? "",
		stripeSubscriptionStatus: stripeSubscriptionStatus ?? "",
		lang: lang ?? "fr",
	};

	saveUserInformation(services, {
		userInformation: { ...finalUserInformation, queryCount: queryCount + 1 },
		team,
		user,
	});

	await handleQuestion(services, {
		team,
		user,
		channel,
		threadTs: threadTs ?? userMessageTs,
		question: text,
		slackClient: client,
		userInformation: finalUserInformation,
	});
});

(async () => {
	// Start the app
	const server = await app.start(3334);

	console.log("⚡️ Bolt app is running!");
})();
