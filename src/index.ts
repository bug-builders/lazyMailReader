import { GmailLoader } from "./document_loaders/web/gmail.js";
import { SentenceTransformersEmbeddings } from "./embeddings/sentenceTransformers.js";
import { LazyMailReaderVectorStore } from "./vectorstores/lazyMailReader.js";
import { Client } from "@elastic/elasticsearch";
import { BaseCallbackHandler, CallbackManager } from "langchain/callbacks";
import { ChatOpenAI } from "langchain/chat_models/openai";
import { PromptTemplate } from "langchain/prompts";
import {
	BaseChatMessage,
	HumanChatMessage,
	SystemChatMessage,
} from "langchain/schema";
import { TokenTextSplitter } from "langchain/text_splitter";
import readline from "readline";

const ELASTICSEARCH_URL = "http://127.0.0.1:9200";
const BATCH_SIZE = 10;

async function askQuestion({
	rl,
	lazyMailVectorStore,
	splitter,
	chat,
	emailAddress,
	discussion = [],
}: {
	rl: readline.Interface;
	lazyMailVectorStore: LazyMailReaderVectorStore;
	splitter: TokenTextSplitter;
	chat: ChatOpenAI;
	emailAddress?: string;
	discussion?: BaseChatMessage[];
}) {
	const question = await new Promise<string>((resolve) => {
		rl.question(
			discussion.length === 0
				? "What do you want to know from your emails?\n"
				: "",
			resolve,
		);
	});

	const docs = await lazyMailVectorStore.similaritySearch(question, 10, {
		query: question,
	});

	const inputDocuments = await Promise.all(
		docs.map(async (doc) => ({
			...doc,
			pageContent: (await splitter.splitText(doc.pageContent)).at(0),
		})),
	);

	const emails = inputDocuments
		.map((doc) => doc.pageContent)
		.join('\n"""\n---\n"""\n');

	const template = `Context:
---
"""
{emails}
"""
---
${emailAddress && `My email address is ${emailAddress}.`}
Question: {question}`;

	const prompt = PromptTemplate.fromTemplate(template);

	const finalPrompt = await prompt.format({ question, emails });

	discussion.push(new HumanChatMessage(finalPrompt));

	const response = await chat.call([
		new SystemChatMessage(
			"You will be provided with a list of emails to use as context. Your goal is to answer the user question based on this context.",
		),
		/** It seems reinforcing the emails by passing it in a special system context gives better results */
		...inputDocuments.map((document) => ({
			_getType: () => "system",
			text: document.pageContent ?? "",
			name: "email",
		})),
		...discussion,
	]);

	discussion.push(response);
	console.log("");
	return discussion;
}

(async () => {
	if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
		throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET");
	}

	const gmailLoader = new GmailLoader({
		googleClientId: process.env.GOOGLE_CLIENT_ID,
		googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
	});

	const client = new Client({
		node: ELASTICSEARCH_URL,
	});

	const callbackManager = new CallbackManager();

	const chat = new ChatOpenAI({
		temperature: 0.5,
		streaming: true,
		maxConcurrency: 1,
		maxRetries: 1,
		callbackManager,
	});

	const splitter = new TokenTextSplitter({
		encodingName: "gpt2",
		chunkSize: 200,
		chunkOverlap: 0,
	});

	const lazyMailVectorStore = new LazyMailReaderVectorStore(
		new SentenceTransformersEmbeddings(),
		{ client },
	);

	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	const fetchEmails = await new Promise<string>((resolve) => {
		rl.question("Do you want to fetch your last emails? (N/y) ", resolve);
	});

	if (fetchEmails.toLowerCase().startsWith("y")) {
		const documents = await gmailLoader.load();

		for (let i = 0; i < documents.length; i += BATCH_SIZE) {
			const currentDocumentBatch = documents.slice(i, i + BATCH_SIZE);
			console.log(`Indexing ${currentDocumentBatch.length} emails...`);
			await lazyMailVectorStore.addDocuments(currentDocumentBatch);
		}
	}

	const emailAddress = await gmailLoader.getUserEmailAddress();

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
			emailAddress: emailAddress ?? undefined,
			lazyMailVectorStore,
			rl,
			splitter,
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
