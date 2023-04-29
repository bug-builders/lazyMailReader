import { WebClient } from "../www.js";
import { TOKEN_BUFFER_LENGTH } from "./constant.js";
import { BaseCallbackHandler, CallbackManager } from "langchain/callbacks";
import { ChatOpenAI } from "langchain/chat_models/openai";

export function bindChatToSlackMessage({
	channel,
	ts,
	openAIKey,
	slackClient,
	initialText = "",
}: {
	channel: string;
	ts: string;
	openAIKey: string;
	slackClient: WebClient;
	initialText?: string;
}) {
	let newText = initialText;
	let previousTextLength = newText.length;

	const callbackManager = new CallbackManager();

	const handleToken: BaseCallbackHandler = {
		name: `handle_${ts}`,
		copy: () => handleToken,
		handleLLMNewToken: async (token) => {
			newText += token;

			if (newText.length - previousTextLength > TOKEN_BUFFER_LENGTH) {
				await slackClient.chat.update({ channel, ts, text: newText });
				previousTextLength = newText.length;
			}
		},
		handleLLMEnd: async () => {
			await slackClient.chat.update({ channel, ts, text: newText });
			callbackManager.removeHandler(handleToken);
		},
		ignoreAgent: true,
		ignoreChain: true,
		ignoreLLM: false,
	};

	callbackManager.addHandler(handleToken);

	const chat = new ChatOpenAI({
		openAIApiKey: openAIKey,
		// modelName: "gpt-4",
		temperature: 0.5,
		streaming: true,
		maxConcurrency: 1,
		maxRetries: 1,
		callbackManager,
	});
	return chat;
}
