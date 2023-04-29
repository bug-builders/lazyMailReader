import {
	retrieveUserInformation,
	saveUserInformation,
} from "../data-accessors/user-information.js";
import { PROGRESS_PREFIX, TWO_SECONDS } from "../utils/constant.js";
import { postOrUpdateMessage } from "../utils/postOrUpdateMessage.js";
import { Services } from "../utils/setupServices.js";
import { LazyMailReaderMetadata } from "../vectorstores/lazyMailReader.js";
import { WebClient } from "../www.js";
import { Document } from "langchain/document";

const INDEXATION_BATCH_SIZE = 10;

export async function indexEmails(
	services: Services,
	{
		documents,
		slackClient,
		channel,
		ts,
		team,
		user,
	}: {
		team: string;
		user: string;
		ts?: string;
		channel: string;
		slackClient: WebClient;
		documents: Document<LazyMailReaderMetadata>[];
	},
) {
	let currentTs = ts;
	try {
		currentTs = await postOrUpdateMessage({
			slackClient,
			channel,
			text: PROGRESS_PREFIX,
			ts,
		});

		let lastUpdateAt = Date.now();

		for (let i = 0; i < documents.length; i += INDEXATION_BATCH_SIZE) {
			const currentDocumentBatch = documents.slice(
				i,
				i + INDEXATION_BATCH_SIZE,
			);
			if (Date.now() - lastUpdateAt > TWO_SECONDS) {
				await postOrUpdateMessage({
					slackClient,
					channel,
					text: `${PROGRESS_PREFIX}Lecture [${i}/${documents.length}]`,
					ts: currentTs,
				});

				lastUpdateAt = Date.now();
			}
			await services.lazyMailVectorStore.addDocuments(currentDocumentBatch);
		}

		const userInformation = retrieveUserInformation(services, { team, user });

		userInformation.lastIndexationDoneAt = new Date().toISOString();
		saveUserInformation(services, { team, user, userInformation });

		return { ts: currentTs };
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
