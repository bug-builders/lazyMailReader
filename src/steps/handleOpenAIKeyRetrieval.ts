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
}: {
	channel: string;
	text: string;
	displayName: string;
	slackClient: WebClient;
}) {
	const openAIKeyMatch = text.match(openAIKeyRegExp);
	if (!openAIKeyMatch?.[0]) {
		return null;
	}
	const openAIKey = openAIKeyMatch?.[0];
	if (!openAIKey) {
		return null;
	}
	const initialText =
		"Merci, laisse moi vérifier si elle fonctionne correctement...\n";
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
			new SystemChatMessage(
				`Tu es l'assistant personnel des emails de ${displayName}. Tu as une liste d'emails pouvant contenir la réponse à la question de ${displayName}. Ton but est de lire puis de répondre à ${displayName} du mieux que tu peux.`,
			),
			new HumanChatMessage("Bonjour !"),
			new AIChatMessage(`Bonjour !
Nous allons d'abord terminer de m'installer.
Afin de pouvoir continuer la discussion j'ai besoin d'une clé OpenAI...
Si tu peux juste me la coller là, ça me permettra d'être plus intelligent :D
Merci!`),
			new HumanChatMessage("Voici la clé: sk_ultAMrcUJo57kNDalZGo-nXn6L7YSAK2"),
			new AIChatMessage(initialText),
			new HumanChatMessage(
				`Présentes toi et raconte moi directement une anectode sur l'inventeur des emails sans me rappeler que je te l'ai demandé.`,
			),
		]);
		return openAIKey;
	} catch (error) {
		await slackClient.chat.postMessage({
			channel,
			text: `Oups, cela n'a pas fonctionné. Peux tu réessayer ?
${error}`,
		});
		throw error;
	}
}
