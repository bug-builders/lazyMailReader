import { GmailLoader } from "../document_loaders/web/gmail.js";
import { MSLoader } from "../document_loaders/web/ms.js";
import { SentenceTransformersEmbeddings } from "../embeddings/sentenceTransformers.js";
import { LazyMailReaderVectorStore } from "../vectorstores/lazyMailReader.js";
import { assertExists } from "./typing.js";
import { encoding_for_model } from "@dqbd/tiktoken";
import { Client } from "@elastic/elasticsearch";
import Stripe from "stripe";

export function setupServices() {
	const {
		GOOGLE_CLIENT_ID,
		GOOGLE_CLIENT_SECRET,
		GOOGLE_REDIRECT_URI,
		MS_CLIENT_ID,
		MS_CLIENT_SECRET,
		MS_REDIRECT_URI,
		SLACK_SIGNING_SECRET,
		SLACK_BOT_TOKEN,
		SECRET_KEY,
		ELASTICSEARCH_URL,
		SENTENCE_TRANSFORMERS_URL,
		SLACK_CLIENT_ID,
		SLACK_CLIENT_SECRET,
		SLACK_STATE_SECRET_KEY,
		ONE_PAGE_DIRECTORY,
		STRIPE_SECRET_KEY,
		STRIPE_WEBHOOK_SECRET,
		STRIPE_SUBSCRIPTION_LINK,
		STRIPE_CUSTOMER_PORTAL,
	} = process.env;

	assertExists(GOOGLE_CLIENT_ID, "GOOGLE_CLIENT_ID");
	assertExists(GOOGLE_CLIENT_SECRET, "GOOGLE_CLIENT_SECRET");
	assertExists(GOOGLE_REDIRECT_URI, "GOOGLE_REDIRECT_URI");
	assertExists(MS_CLIENT_ID, "MS_CLIENT_ID");
	assertExists(MS_CLIENT_SECRET, "MS_CLIENT_SECRET");
	assertExists(MS_REDIRECT_URI, "MS_REDIRECT_URI");
	assertExists(SLACK_SIGNING_SECRET, "SLACK_SIGNING_SECRET");
	assertExists(SLACK_BOT_TOKEN, "SLACK_BOT_TOKEN");
	assertExists(SECRET_KEY, "SECRET_KEY");
	assertExists(SLACK_STATE_SECRET_KEY, "SLACK_STATE_SECRET_KEY");
	assertExists(SLACK_CLIENT_ID, "SLACK_CLIENT_ID");
	assertExists(SLACK_CLIENT_SECRET, "SLACK_CLIENT_SECRET");
	assertExists(ONE_PAGE_DIRECTORY, "ONE_PAGE_DIRECTORY");
	assertExists(STRIPE_SECRET_KEY, "STRIPE_SECRET_KEY");
	assertExists(STRIPE_WEBHOOK_SECRET, "STRIPE_WEBHOOK_SECRET");
	assertExists(STRIPE_SUBSCRIPTION_LINK, "STRIPE_SUBSCRIPTION_LINK");
	assertExists(STRIPE_CUSTOMER_PORTAL, "STRIPE_CUSTOMER_PORTAL");

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

	const encoding = encoding_for_model("text-davinci-003");

	const gmailLoader = new GmailLoader({
		googleClientId: GOOGLE_CLIENT_ID,
		googleClientSecret: GOOGLE_CLIENT_SECRET,
		googleRedirectUri: GOOGLE_REDIRECT_URI,
	});

	const msLoader = new MSLoader({
		msClientId: MS_CLIENT_ID,
		msClientSecret: MS_CLIENT_SECRET,
		msRedirectUrl: MS_REDIRECT_URI,
	});

	const stripeClient = new Stripe(STRIPE_SECRET_KEY, {
		apiVersion: "2022-11-15",
	});

	return {
		elasticsearchClient,
		encoding,
		gmailLoader,
		msLoader,
		embedding,
		lazyMailVectorStore,
		stripeClient,
		config: {
			MS_CLIENT_ID,
			MS_CLIENT_SECRET,
			MS_REDIRECT_URI,
			GOOGLE_CLIENT_ID,
			STRIPE_WEBHOOK_SECRET,
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
			ONE_PAGE_DIRECTORY,
			STRIPE_SECRET_KEY,
			STRIPE_SUBSCRIPTION_LINK,
			STRIPE_CUSTOMER_PORTAL,
			userInformationDirectory:
				process.env.USER_INFORMATION_DIRECTORY ?? "/tmp/",
		},
	};
}

export type Services = ReturnType<typeof setupServices>;
