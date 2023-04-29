import {
	retrieveUserInformation,
	saveUserInformation,
} from "../data-accessors/user-information.js";
import { GmailLoader } from "../document_loaders/web/gmail.js";
import { PROGRESS_PREFIX } from "../utils/constant.js";
import { postOrUpdateMessage } from "../utils/postOrUpdateMessage.js";
import { Services } from "../utils/setupServices.js";
import { assertExists } from "../utils/typing.js";
import { LazyMailReaderMetadata } from "../vectorstores/lazyMailReader.js";
import { WebClient } from "../www.js";
import fs from "fs";
import { Document } from "langchain/document";
import { join } from "path";

const TWO_SECONDS = 2 * 1000;

export async function downloadEmails(
	services: Services,
	{
		slackClient,
		team,
		user,
		tokens,
		channel,
		ts,
	}: {
		slackClient: WebClient;
		team: string;
		user: string;
		channel: string;
		ts?: string;
		tokens: { accessToken: string; refreshToken: string };
	},
) {
	let currentTs = ts;
	try {
		const googleEmlPath = join(
			services.config.userInformationDirectory,
			`/${team}-${user}/eml-files`,
		);

		const cacheExists = fs.existsSync(googleEmlPath);
		if (!cacheExists) {
			fs.mkdirSync(googleEmlPath, { recursive: true });
		}

		const gmailLoader = new GmailLoader({
			googleClientId: services.config.GOOGLE_CLIENT_ID,
			googleClientSecret: services.config.GOOGLE_CLIENT_SECRET,
			accessToken: tokens.accessToken,
			refreshToken: tokens.refreshToken,
			cachedUserTokenPath: "/dev/null",
			googleEmlPath,
		});

		currentTs = await postOrUpdateMessage({
			slackClient,
			channel,
			text: PROGRESS_PREFIX,
			ts,
		});

		const emailAddress = await gmailLoader.getUserEmailAddress();

		assertExists(emailAddress, "emailAddress");

		let lastUpdateAt = Date.now();

		const documents = await gmailLoader.load({
			userId: `${team}-${user}`,
			progressCallback: async ({ index, total }) => {
				if (Date.now() - lastUpdateAt > TWO_SECONDS) {
					await postOrUpdateMessage({
						slackClient,
						channel,
						ts: currentTs,
						text: `${PROGRESS_PREFIX} Téléchargement [${index}/${total}]`,
					});
					lastUpdateAt = Date.now();
				}
			},
		});

		const userInformation = retrieveUserInformation(services, { team, user });

		userInformation.lastEmailsDownloadedAt = new Date().toISOString();
		userInformation.accessToken = tokens.accessToken;
		userInformation.refreshToken = tokens.refreshToken;
		userInformation.emailAddress = emailAddress;

		saveUserInformation(services, { team, user, userInformation });

		return {
			documents,
			ts: currentTs,
		};
	} catch (error) {
		await postOrUpdateMessage({
			slackClient,
			channel,
			ts: currentTs,
			text: "Quelque chose s'est mal passé. Je vais contacter le support et je reviens vers toi...",
		});
		throw error;
	}
}
