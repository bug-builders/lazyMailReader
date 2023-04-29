import { SentenceTransformersEmbeddings } from "../embeddings/sentenceTransformers.js";
import { LazyMailReaderVectorStore } from "../vectorstores/lazyMailReader.js";
import { assertExists } from "./typing.js";
import { encoding_for_model } from "@dqbd/tiktoken";
import { Client } from "@elastic/elasticsearch";
import { google } from "googleapis";

export function setupServices() {
	const {
		GOOGLE_CLIENT_ID,
		GOOGLE_CLIENT_SECRET,
		GOOGLE_REDIRECT_URI,
		SLACK_SIGNING_SECRET,
		SLACK_BOT_TOKEN,
		SECRET_KEY,
		ELASTICSEARCH_URL,
		SENTENCE_TRANSFORMERS_URL,
		SLACK_CLIENT_ID,
		SLACK_CLIENT_SECRET,
		SLACK_STATE_SECRET_KEY,
	} = process.env;

	assertExists(GOOGLE_CLIENT_ID, "GOOGLE_CLIENT_ID");
	assertExists(GOOGLE_CLIENT_SECRET, "GOOGLE_CLIENT_SECRET");
	assertExists(GOOGLE_REDIRECT_URI, "GOOGLE_REDIRECT_URI");
	assertExists(SLACK_SIGNING_SECRET, "SLACK_SIGNING_SECRET");
	assertExists(SLACK_BOT_TOKEN, "SLACK_BOT_TOKEN");
	assertExists(SECRET_KEY, "SECRET_KEY");
	assertExists(SLACK_STATE_SECRET_KEY, "SLACK_STATE_SECRET_KEY");
	assertExists(SLACK_CLIENT_ID, "SLACK_CLIENT_ID");
	assertExists(SLACK_CLIENT_SECRET, "SLACK_CLIENT_SECRET");

	const embedding = new SentenceTransformersEmbeddings({
		sentenceTransformersUrl: SENTENCE_TRANSFORMERS_URL,
	});

	const elasticsearchClient = new Client({
		node: ELASTICSEARCH_URL ?? "http://127.0.0.1:9200",
	});

	const lazyMailVectorStore = new LazyMailReaderVectorStore(embedding, {
		multiLang: true,
		client: elasticsearchClient,
	});

	const googleOauth2Client = new google.auth.OAuth2(
		GOOGLE_CLIENT_ID,
		GOOGLE_CLIENT_SECRET,
		GOOGLE_REDIRECT_URI,
	);

	const encoding = encoding_for_model("text-davinci-003");

	return {
		encoding,
		googleOauth2Client,
		embedding,
		lazyMailVectorStore,
		config: {
			GOOGLE_CLIENT_ID,
			GOOGLE_CLIENT_SECRET,
			GOOGLE_REDIRECT_URI,
			SLACK_SIGNING_SECRET,
			SLACK_BOT_TOKEN,
			SECRET_KEY,
			ELASTICSEARCH_URL,
			SENTENCE_TRANSFORMERS_URL,
			SLACK_CLIENT_ID,
			SLACK_CLIENT_SECRET,
			SLACK_STATE_SECRET_KEY,
			userInformationDirectory:
				process.env.USER_INFORMATION_DIRECTORY ?? "/tmp/",
		},
	};
}

export type Services = ReturnType<typeof setupServices>;
