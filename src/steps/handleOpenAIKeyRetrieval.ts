import { selectLang } from "../i18n/index.js";
import { bindChatToSlackMessage } from "../utils/bindChatToSlackMessage.js";
import { assertExists } from "../utils/typing.js";
import { WebClient } from "../www.js";
import bolt from "@slack/bolt";
import {
	AIChatMessage,
	HumanChatMessage,
	SystemChatMessage,
} from "langchain/schema";

const openAIKeyRegExp = new RegExp("(sk-[0-9A-Za-z]+)");

export async function handleOpenAIKeyRetrieval({
	text,
	displayName,
	slackClient,
	channel,
	lang,
}: {
	channel: string;
	text: string;
	displayName: string;
	slackClient: WebClient;
	lang?: "en" | "fr";
}) {
	const openAIKeyMatch = text.match(openAIKeyRegExp);
	if (!openAIKeyMatch?.[0]) {
		return null;
	}
	const openAIKey = openAIKeyMatch?.[0];
	if (!openAIKey) {
		return null;
	}
	const initialText = `${selectLang(lang).thxForTheKey}\n`;
	const { ts } = await slackClient.chat.postMessage({
		text: initialText,
		channel,
	});

	assertExists(ts, "ts");

	const chat = bindChatToSlackMessage({
		channel,
		ts,
		openAIKey,
		slackClient,
		initialText,
	});

	try {
		await chat.call([
			new SystemChatMessage(selectLang(lang).prompt.baseSystem),
			new HumanChatMessage(`${selectLang(lang).hello} !`),
			new AIChatMessage(`${selectLang(lang).hello} !
${selectLang(lang).prompt.askForKey}`),
			new HumanChatMessage(
				`${
					selectLang(lang).prompt.hereIsTheKey
				}: sk_ultAMrcUJo57kNDalZGo-nXn6L7YSAK2`,
			),
			new AIChatMessage(initialText),
			new HumanChatMessage(selectLang(lang).prompt.presentYourself),
		]);
		return openAIKey;
	} catch (error) {
		await slackClient.chat.postMessage({
			channel,
			text: `${selectLang(lang).oopsDidntWork}
${error}`,
		});
		throw error;
	}
}
