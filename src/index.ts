import { GmailLoader } from "./document_loaders/web/gmail.js";
import { SentenceTransformersEmbeddings } from "./embeddings/sentenceTransformers.js";
import { I18N } from "./i18n/index.js";
import { metadataDates as metadataDatesFr } from "./prompts/metadata-dates-fr.js";
import { metadataDates } from "./prompts/metadata-dates.js";
import { metadataQuestion as metadataQuestionFr } from "./prompts/metadata-question-fr.js";
import { metadataQuestion } from "./prompts/metadata-question.js";
import { metadataSenders as metadataSendersFr } from "./prompts/metadata-senders-fr.js";
import { metadataSenders } from "./prompts/metadata-senders.js";
import { metadataSubject as metadataSubjectFr } from "./prompts/metadata-subject-fr.js";
import { metadataSubject } from "./prompts/metadata-subject.js";
import {
	LazyMailReaderMetadata,
	LazyMailReaderVectorStore,
} from "./vectorstores/lazyMailReader.js";
import { encoding_for_model } from "@dqbd/tiktoken";
import { Client } from "@elastic/elasticsearch";
import { existsSync, mkdirSync } from "fs";
import { BaseCallbackHandler, CallbackManager } from "langchain/callbacks";
import { ChatOpenAI } from "langchain/chat_models/openai";
import { Document } from "langchain/document";
import {
	BaseChatMessage,
	HumanChatMessage,
	SystemChatMessage,
} from "langchain/schema";
import { TokenTextSplitter } from "langchain/text_splitter";
import { join } from "path";
import readline from "readline";

const enc = encoding_for_model("gpt-3.5-turbo");

const multiLang = process.env.USER_LANG !== "en";

function selectLang(lang?: string) {
	if (lang === "fr") {
		return I18N.fr;
	}

	return I18N.en;
}

const {
	systemPrompt,
	myEmail,
	initialQuestion,
	fetchEmailsQuestion,
	currentDate,
} = selectLang(process.env.USER_LANG);

const MAX_OPENAI_TOKENS = 4096;
const MINIMUM_TOKEN_FOR_ANSWER = 512;
const ELASTICSEARCH_URL = "http://127.0.0.1:9200";
const BATCH_SIZE = 10;

async function askQuestion({
	rl,
	lazyMailVectorStore,
	chat,
	emailAddress,
	embedding,
	discussion = [],
}: {
	rl: readline.Interface;
	lazyMailVectorStore: LazyMailReaderVectorStore;
	chat: ChatOpenAI;
	emailAddress?: string;
	embedding: SentenceTransformersEmbeddings;
	discussion?: BaseChatMessage[];
}) {
	const splitter = new TokenTextSplitter({
		encodingName: "cl100k_base",
		chunkSize: 512,
		chunkOverlap: 32,
	});

	const question = await new Promise<string>((resolve) => {
		rl.question(discussion.length === 0 ? `${initialQuestion}\n` : "", resolve);
	});

	const [dates, subject, generatedQuestion, senders] = await Promise.all([
		metadataDatesFr(question),
		metadataSubjectFr(question),
		metadataQuestionFr(question),
		metadataSendersFr(question),
	]);

	console.log(
		JSON.stringify([dates, subject, generatedQuestion, senders], null, 2),
	);

	const docs = (await lazyMailVectorStore.similaritySearch(question, 50, {
		query: generatedQuestion ?? question,
		userId: "test",
		dates,
		subject,
		senders,
	})) as Document<LazyMailReaderMetadata>[];

	const inputDocuments: {
		pageContent: string | undefined;
		metadata: LazyMailReaderMetadata;
	}[] = [];

	let countToken = 0;
	for (const doc of docs) {
		const safelySplittedText =
			(await splitter.splitText(doc.pageContent)).at(0) ?? "";
		const nextContentTokenLength = enc.encode(safelySplittedText).length;
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

	discussion.push(
		new HumanChatMessage(
			`${currentDate} ${new Date().toISOString()}. ${
				emailAddress && `${myEmail} ${emailAddress}.\n`
			}${question}`,
		),
	);

	const response = await chat.call([
		new SystemChatMessage(systemPrompt),
		...inputDocuments.map((document) => ({
			_getType: () => "system",
			text: document.pageContent ?? "",
			name: "email",
		})),
		...discussion,
	]);

	discussion.push(response);

	const answerScores = await embedding.crossEncode(
		response.text,
		inputDocuments.map((document) => document.pageContent ?? ""),
		multiLang,
	);

	const metadataWithScore = inputDocuments.map((document, i) => {
		return {
			metadata: document.metadata,
			score: answerScores.at(i) ?? 0,
		};
	});

	console.log("");
	const sources = metadataWithScore
		.sort((a, b) => b.score - a.score)
		.map((m) => m);

	console.log("Sources:");
	const mailUrls = sources.map(
		(source) =>
			`https://mail.google.com/mail/u/0/#inbox/${source.metadata.messageId}`,
	);
	const uniqueMailUrls: Set<string> = new Set(mailUrls);
	[...uniqueMailUrls].forEach((mailUrl) => console.log(mailUrl));
	return discussion;
}

(async () => {
	if (
		!process.env.GOOGLE_CLIENT_ID ||
		!process.env.GOOGLE_CLIENT_SECRET ||
		!process.env.GOOGLE_REDIRECT_URI
	) {
		throw new Error(
			"Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET or GOOGLE_REDIRECT_URI",
		);
	}

	const gmailLoader = new GmailLoader({
		googleClientId: process.env.GOOGLE_CLIENT_ID,
		googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
		googleRedirectUri: process.env.GOOGLE_REDIRECT_URI,
	});

	const client = new Client({
		node: ELASTICSEARCH_URL,
	});

	const callbackManager = new CallbackManager();

	const chat = new ChatOpenAI({
		// modelName: "gpt-4",
		temperature: 0.5,
		streaming: true,
		maxConcurrency: 1,
		maxRetries: 1,
		callbackManager,
	});

	const embedding = new SentenceTransformersEmbeddings();

	const lazyMailVectorStore = new LazyMailReaderVectorStore(embedding, {
		multiLang: multiLang ?? false,
		client,
	});

	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	const fetchEmails = await new Promise<string>((resolve) => {
		rl.question(`${fetchEmailsQuestion} (N/y) `, resolve);
	});

	if (fetchEmails.toLowerCase().startsWith("y")) {
		const googleEmlPath = "/tmp/test/eml-files";

		const cacheExists = existsSync(googleEmlPath);
		if (!cacheExists) {
			mkdirSync(googleEmlPath, { recursive: true });
		}

		const tokens = await gmailLoader.getAuthorization(
			"/tmp/google-credentials.json",
		);

		const documents = await gmailLoader.load({
			emlPath: googleEmlPath,
			tokens,
			userId: "test",
			progressCallback: async ({ index, total }) =>
				console.log(`[${index}/${total}] reading mails`),
		});

		for (let i = 0; i < documents.length; i += BATCH_SIZE) {
			const currentDocumentBatch = documents.slice(i, i + BATCH_SIZE);
			await lazyMailVectorStore.addDocuments(currentDocumentBatch, {
				userId: "test",
			});
		}
	}

	const handleToken: BaseCallbackHandler = {
		name: "handleToken",
		copy: () => handleToken,
		handleLLMNewToken: async (token) => {
			process.stdout.write(token);
		},
		ignoreAgent: true,
		ignoreChain: true,
		ignoreLLM: false,
	};

	callbackManager.addHandler(handleToken);
	let discussion: BaseChatMessage[] = [];
	while (true) {
		discussion = await askQuestion({
			chat,
			lazyMailVectorStore,
			rl,
			embedding,
			discussion: discussion.map((d) => {
				if (d._getType() === "human") {
					const humanMessage = d.text.split("\n").at(-1);
					return new HumanChatMessage(humanMessage ?? "");
				} else {
					return d;
				}
			}),
		});
	}
})();
