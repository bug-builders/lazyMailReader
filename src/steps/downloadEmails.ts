import {
	retrieveUserInformation,
	saveUserInformation,
} from "../data-accessors/user-information.js";
import { PROGRESS_PREFIX } from "../utils/constant.js";
import { postOrUpdateMessage } from "../utils/postOrUpdateMessage.js";
import { Services } from "../utils/setupServices.js";
import { assertExists } from "../utils/typing.js";
import { LazyMailReaderMetadata } from "../vectorstores/lazyMailReader.js";
import { WebClient } from "../www.js";
import { setupBot } from "./setupBot.js";
import { GraphError } from "@microsoft/microsoft-graph-client";
import fs from "fs";
import { Document } from "langchain/document";
import { join } from "path";

const TWO_SECONDS = 2 * 1000;

async function downloadEmailsByType(
	services: Services,
	{
		loaderType,
		tokens,
		emlPath,
		team,
		user,
		progressCallback,
	}: {
		loaderType: string;
		tokens: { accessToken: string; refreshToken: string };
		emlPath: string;
		team: string;
		user: string;
		progressCallback: (options: {
			index: number;
			total: number;
		}) => Promise<void>;
	},
) {
	if (loaderType === "ms") {
		const emailAddress = await services.msLoader.getUserEmailAddress(tokens);
		assertExists(emailAddress, "emailAddress");

		const documents = await services.msLoader.load({
			tokens,
			emlPath,
			userId: `${team}-${user}`,
			progressCallback,
		});

		return { emailAddress, documents };
	}
	const emailAddress = await services.gmailLoader.getUserEmailAddress(tokens);

	assertExists(emailAddress, "emailAddress");

	const documents = await services.gmailLoader.load({
		tokens,
		emlPath,
		userId: `${team}-${user}`,
		progressCallback,
	});
	return { emailAddress, documents };
}

export async function downloadEmails(
	services: Services,
	{
		slackClient,
		team,
		user,
		tokens,
		channel,
		loaderType,
		ts,
	}: {
		slackClient: WebClient;
		team: string;
		user: string;
		channel: string;
		loaderType: string;
		ts?: string;
		tokens: { accessToken: string; refreshToken: string };
	},
) {
	let currentTs = ts;
	try {
		const emlPath = join(
			services.config.userInformationDirectory,
			`/${team}-${user}/eml-files`,
		);

		const cacheExists = fs.existsSync(emlPath);
		if (!cacheExists) {
			fs.mkdirSync(emlPath, { recursive: true });
		}

		currentTs = await postOrUpdateMessage({
			slackClient,
			channel,
			text: PROGRESS_PREFIX,
			ts,
		});

		let lastUpdateAt = Date.now();
		const progressCallback = async ({
			index,
			total,
		}: { index: number; total: number }) => {
			if (Date.now() - lastUpdateAt > TWO_SECONDS) {
				await postOrUpdateMessage({
					slackClient,
					channel,
					ts: currentTs,
					text: `${PROGRESS_PREFIX} Téléchargement [${index}/${total}]`,
				});
				lastUpdateAt = Date.now();
			}
		};

		const {
			emailAddress,
			documents,
		}: { emailAddress: string; documents: Document<LazyMailReaderMetadata>[] } =
			await downloadEmailsByType(services, {
				emlPath,
				loaderType,
				progressCallback,
				team,
				tokens,
				user,
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
		if (
			error instanceof GraphError &&
			error.code === "InvalidAuthenticationToken"
		) {
			const userInformation = retrieveUserInformation(services, { team, user });

			try {
				if (!userInformation.refreshToken || !userInformation.loaderType) {
					throw new Error("No refresh token");
				}
				const { accessToken, refreshToken } =
					userInformation.loaderType === "ms"
						? await services.msLoader.refreshTokens(
								userInformation.refreshToken,
						  )
						: await services.gmailLoader.refreshTokens(
								userInformation.refreshToken,
						  );
				if (!accessToken || !refreshToken) {
					throw new Error("Refresh didn't work");
				}

				userInformation.accessToken = accessToken;
				userInformation.refreshToken = refreshToken;

				saveUserInformation(services, { team, user, userInformation });
				await downloadEmails(services, {
					channel,
					loaderType,
					slackClient,
					team,
					tokens: { accessToken, refreshToken },
					user,
					ts,
				});
			} catch (error2) {
				await postOrUpdateMessage({
					slackClient,
					channel,
					ts: currentTs,
					text: "L'accès aux emails a été révoqué...",
				});
				// rome-ignore lint/performance/noDelete: <explanation>
				delete userInformation.accessToken;
				// rome-ignore lint/performance/noDelete: <explanation>
				delete userInformation.refreshToken;
				// rome-ignore lint/performance/noDelete: <explanation>
				delete userInformation.loaderType;
				saveUserInformation(services, { team, user, userInformation });
				await setupBot(services, { user, team, slackClient, channel });
				throw error2;
			}
		}

		await postOrUpdateMessage({
			slackClient,
			channel,
			ts: currentTs,
			text: "Quelque chose s'est mal passé. Je vais contacter le support et je reviens vers toi...",
		});

		throw error;
	}
}
