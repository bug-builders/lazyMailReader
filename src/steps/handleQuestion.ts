import { UserInformation } from "../data-accessors/user-information.js";
import { metadataDates } from "../prompts/metadata-dates-fr.js";
import { metadataQuestion } from "../prompts/metadata-question-fr.js";
import { metadataSenders } from "../prompts/metadata-senders-fr.js";
import { metadataSubject } from "../prompts/metadata-subject-fr.js";
import { bindChatToSlackMessage } from "../utils/bindChatToSlackMessage.js";
import {
	MAX_OPENAI_TOKENS,
	MINIMUM_TOKEN_FOR_ANSWER,
} from "../utils/constant.js";
import { postOrUpdateMessage } from "../utils/postOrUpdateMessage.js";
import { Services } from "../utils/setupServices.js";
import { LazyMailReaderMetadata } from "../vectorstores/lazyMailReader.js";
import { WebClient } from "../www.js";
import { Document } from "langchain/document";
import {
	HumanMessagePromptTemplate,
	SystemMessagePromptTemplate,
} from "langchain/prompts";
import {
	AIChatMessage,
	BaseChatMessage,
	HumanChatMessage,
} from "langchain/schema";
import { TokenTextSplitter } from "langchain/text_splitter";
import { clearInterval } from "timers";

const THINKING = "Thinking...";

enum MetadataType {
	Thinking = "thinking",
	Sources = "sources",
	Answer = "answer",
}

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
	const firstTs = await postOrUpdateMessage({
		metadata: {
			event_type: MetadataType.Thinking,
			event_payload: {},
		},
		channel,
		slackClient,
		text: `_${THINKING}_`,
		threadTs,
	});

	const [dates, subject, generatedQuestion, senders] = await Promise.all([
		metadataDates(question),
		metadataSubject(question),
		metadataQuestion(question),
		metadataSenders(question),
	]);

	await postOrUpdateMessage({
		metadata: {
			event_type: MetadataType.Thinking,
			event_payload: {},
		},
		ts: firstTs,
		channel,
		slackClient,
		text: `_Recherche d'emails ayant pour sujet: ${subject}_
${
	dates.startingDate || dates.endingDate
		? `_Sur la période ${dates.startingDate} - ${dates.endingDate}_`
		: ""
}
${senders ? `_Envoyés par ${senders.join(" ou ")}` : ""}_
${question ? `_${generatedQuestion}_` : ""}`,
		threadTs,
	});

	const threadReplies = await slackClient.conversations.replies({
		ts: threadTs,
		channel,
	});

	const ts = await postOrUpdateMessage({
		channel,
		slackClient,
		text: THINKING,
		threadTs,
	});

	let dotTimes = 1;

	const dotInterval = setInterval(async () => {
		await postOrUpdateMessage({
			ts,
			channel,
			slackClient,
			text: `_${THINKING}${".".repeat(dotTimes)}_`,
			threadTs,
		});

		dotTimes += 1;
	}, 2000);
	try {
		const pastMessages: BaseChatMessage[] =
			threadReplies.messages
				?.filter(
					(message) =>
						message.metadata?.event_type !== MetadataType.Thinking &&
						message.metadata?.event_type !== MetadataType.Sources,
				)
				.map((message) => {
					if (message.bot_id) {
						return new AIChatMessage(message.text ?? "");
					}
					return new HumanChatMessage(message.text ?? "");
				}) ?? [];

		const splitter = new TokenTextSplitter({
			encodingName: "cl100k_base",
			chunkSize: 512,
			chunkOverlap: 32,
		});

		const docs = (await services.lazyMailVectorStore.similaritySearch(
			question,
			50,
			{
				query: generatedQuestion ?? question,
				dates,
				subject,
				senders,
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
Ton but est de lire ses emails puis de répondre à {displayName} du mieux que tu peux.`,
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
			question: `${question}

Voici une liste d'emails pouvant contenir la réponse à ma demande.
"""
${inputDocuments.map((document) => document.pageContent).join('\n"""\n"""\n')}
"""
---
Tu peux maintenant répondre à la demande:
${question}
`,
			currentDate: new Date().toISOString(),
		});

		clearInterval(dotInterval);

		const newAIMessage = await chat.call([
			systemPrompt,
			pastMessages.length === 0
				? humanInitialMessage
				: new HumanChatMessage(`${question}

Voici une liste d'emails pouvant contenir la réponse à ma demande.
"""
${inputDocuments.map((document) => document.pageContent).join('\n"""\n"""\n')}
"""
---
Tu peux maintenant répondre à la demande:
${question}
`),
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

		const uniqueMailSources: Map<
			string,
			{ subject: string; from: string; score: number }
		> = new Map();

		sources.forEach((source) => {
			uniqueMailSources.set(
				userInformation.loaderType === "ms"
					? `https://outlook.office365.com/owa/?ItemID=${encodeURIComponent(
							source.metadata.messageId,
					  )}&exvsurl=1&viewmodel=ReadMessageItem`
					: `https://mail.google.com/mail/u/0/#inbox/${source.metadata.messageId}`,
				{
					score: source.score,
					subject: source.metadata.subject,
					from:
						source.metadata.fromAddress?.join(", ") ??
						source.metadata.fromName?.join(", ") ??
						"Inconnu",
				},
			);
		});

		await postOrUpdateMessage({
			metadata: {
				event_type: MetadataType.Sources,
				event_payload: {
					sources: sources.length,
					dates: JSON.stringify(dates),
					subject,
					generatedQuestion: generatedQuestion ?? "",
					senders: JSON.stringify(senders),
				},
			},
			channel,
			threadTs,
			slackClient,
			text: `Sources:
${[...uniqueMailSources.entries()]
	.map(
		([url, metadata]) =>
			`• ${(metadata.score * 100).toFixed(
				2,
			)}% <${url}|${metadata.subject.replaceAll(">", "")}> de ${metadata.from}`,
	)
	.join("\n\n")}`,
		});
	} catch (error) {
		clearInterval(dotInterval);
		await postOrUpdateMessage({
			ts,
			threadTs,
			channel,
			text: `Oups, quelque chose s'est mal passé, je n'ai pas réussi à réfléchir correctement... Je vais contacter le support pour demander de l'aide !`,
			slackClient,
		});

		throw error;
	}
}
