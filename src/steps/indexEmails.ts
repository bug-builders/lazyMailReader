import {
	UserInformation,
	retrieveUserInformation,
	saveUserInformation,
} from "../data-accessors/user-information.js";
import { selectLang } from "../i18n/index.js";
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
		lang,
	}: {
		team: string;
		user: string;
		ts?: string;
		channel: string;
		slackClient: WebClient;
		documents: Document<LazyMailReaderMetadata>[];
		lang: UserInformation["lang"];
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
					text: `${PROGRESS_PREFIX}${selectLang(lang).reading} [${i}/${
						documents.length
					}]`,
					ts: currentTs,
				});

				lastUpdateAt = Date.now();
			}
			await services.lazyMailVectorStore.addDocuments(currentDocumentBatch, {
				userId: `${team}-${user}`,
			});
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
			text: selectLang(lang).contactSupport,
		});
		throw error;
	}
}
