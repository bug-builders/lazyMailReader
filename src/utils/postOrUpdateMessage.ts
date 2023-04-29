import { WebClient } from "../www.js";
import { assertExists } from "./typing.js";

export async function postOrUpdateMessage({
	ts,
	channel,
	text,
	slackClient,
	threadTs,
}: {
	ts?: string;
	channel: string;
	text: string;
	slackClient: WebClient;
	threadTs?: string;
}) {
	if (ts) {
		await slackClient.chat.update({
			text,
			ts,
			channel,
			mrkdwn: true,
		});
		return ts;
	}
	const { ts: newTs } = await slackClient.chat.postMessage({
		mrkdwn: true,
		text,
		...(threadTs ? { thread_ts: threadTs } : {}),
		channel,
	});
	assertExists(newTs, "newTs");
	return newTs;
}
