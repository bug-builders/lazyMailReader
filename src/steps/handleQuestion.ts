import { UserInformation } from "../data-accessors/user-information.js";
import { I18N } from "../i18n/index.js";
import { bindChatToSlackMessage } from "../utils/bindChatToSlackMessage.js";
import {
	MAX_OPENAI_TOKENS,
	MINIMUM_TOKEN_FOR_ANSWER,
} from "../utils/constant.js";
import { postOrUpdateMessage } from "../utils/postOrUpdateMessage.js";
import { Services } from "../utils/setupServices.js";
import { LazyMailReaderMetadata } from "../vectorstores/lazyMailReader.js";
import { WebClient } from "../www.js";
import { UnknownError } from "@slack/bolt";
import { Document } from "langchain/document";
import {
	ChatPromptTemplate,
	HumanMessagePromptTemplate,
	SystemMessagePromptTemplate,
} from "langchain/prompts";
import {
	AIChatMessage,
	BaseChatMessage,
	HumanChatMessage,
} from "langchain/schema";
import { TokenTextSplitter } from "langchain/text_splitter";

const THINKING = "_Thinking..._";

export async function handleQuestion(
	services: Services,
	{
		team,
		user,
		threadTs,
		question,
		userInformation,
		slackClient,
		channel,
	}: {
		team: string;
		user: string;
		threadTs: string;
		question: string;
		channel: string;
		userInformation: Required<UserInformation>;
		slackClient: WebClient;
	},
) {
	const threadReplies = await slackClient.conversations.replies({
		ts: threadTs,
		channel,
	});

	const pastMessages: BaseChatMessage[] = (
		threadReplies.messages?.slice(0, -1) ?? []
	).map((message) => {
		if (message.bot_id) {
			return new AIChatMessage(message.text ?? "");
		}
		return new HumanChatMessage(message.text ?? "");
	});

	const ts = await postOrUpdateMessage({
		channel,
		slackClient,
		text: THINKING,
		threadTs,
	});

	try {
		const splitter = new TokenTextSplitter({
			encodingName: "cl100k_base",
			chunkSize: 512,
			chunkOverlap: 32,
		});

		const docs = (await services.lazyMailVectorStore.similaritySearch(
			question,
			50,
			{
				query: question,
				userId: `${team}-${user}`,
			},
		)) as Document<LazyMailReaderMetadata>[];

		const inputDocuments: {
			pageContent: string | undefined;
			metadata: LazyMailReaderMetadata;
		}[] = [];

		let countToken = 0;
		for (const doc of docs) {
			const safelySplittedText =
				(await splitter.splitText(doc.pageContent)).at(0) ?? "";
			const nextContentTokenLength =
				services.encoding.encode(safelySplittedText).length;
			if (
				countToken + nextContentTokenLength >
				MAX_OPENAI_TOKENS - MINIMUM_TOKEN_FOR_ANSWER
			) {
				break;
			}
			countToken += nextContentTokenLength;
			inputDocuments.push({
				metadata: doc.metadata,
				pageContent: `Subject: ${doc.metadata.subject}\n${
					doc.metadata.fromName?.[0] || doc.metadata.fromAddress?.[0]
						? `From: ${
								doc.metadata.fromName?.[0] ?? doc.metadata.fromAddress?.[0]
						  }\n`
						: ""
				}${safelySplittedText}`,
			});
		}

		const chat = bindChatToSlackMessage({
			slackClient,
			channel,
			ts,
			openAIKey: userInformation.openAIKey,
		});

		const systemPromptTemplate = SystemMessagePromptTemplate.fromTemplate(
			`Tu es l'assistant personnel des emails de {displayName} <{emailAddress}>.
Tu as une liste d'emails pouvant contenir la réponse à la question de {displayName}.
Ton but est de lire ces emails puis de répondre à {displayName} du mieux que tu peux.`,
		);

		const systemPrompt = await systemPromptTemplate.format({
			displayName: userInformation.displayName,
			emailAddress: userInformation.emailAddress,
		});

		const humanInitialMessageTemplate =
			HumanMessagePromptTemplate.fromTemplate(`Je suis {displayName} <{emailAddress}>, nous somme le {currentDate}.
		{question}`);

		const humanInitialMessage = await humanInitialMessageTemplate.format({
			displayName: userInformation.displayName,
			emailAddress: userInformation.emailAddress,
			question,
			currentDate: new Date().toISOString(),
		});

		const newAIMessage = await chat.call([
			systemPrompt,
			...inputDocuments.map((document) => ({
				_getType: () => "system",
				text: document.pageContent ?? "",
				name: "email",
			})),
			pastMessages.length === 0
				? humanInitialMessage
				: new HumanChatMessage(question),
		]);

		const answerScores = await services.embedding.crossEncode(
			newAIMessage.text,
			inputDocuments.map((document) => document.pageContent ?? ""),
			true,
		);

		const metadataWithScore = inputDocuments.map((document, i) => {
			return {
				metadata: document.metadata,
				score: answerScores.at(i) ?? 0,
			};
		});

		const sources = metadataWithScore
			.sort((a, b) => b.score - a.score)
			.map((m) => m);

		const uniqueMailSources: Map<string, { subject: string; from: string }> =
			new Map();

		sources.forEach((source) => {
			uniqueMailSources.set(
				`https://mail.google.com/mail/u/0/#inbox/${source.metadata.messageId}`,
				{
					subject: source.metadata.subject,
					from:
						source.metadata.fromAddress?.join(", ") ??
						source.metadata.fromName?.join(", ") ??
						"Inconnu",
				},
			);
		});

		await postOrUpdateMessage({
			ts,
			channel,
			slackClient,
			text: `${newAIMessage.text}\n\nSources:
${[...uniqueMailSources.entries()]
	.map(
		([url, metadata]) =>
			`• <${url}|${metadata.subject.replaceAll(">", "")}> de ${metadata.from}`,
	)
	.join("\n\n")}`,
		});
	} catch (error) {
		await postOrUpdateMessage({
			ts,
			channel,
			text: `Oups, quelque chose s'est mal passé, je n'ai pas réussi à réfléchir correctement... Je vais contacter le support pour demander de l'aide !`,
			slackClient,
		});

		throw error;
	}
}
