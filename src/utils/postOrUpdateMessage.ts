import { WebClient } from "../www.js";
import { assertExists } from "./typing.js";
import { MessageMetadata } from "@slack/bolt";

export async function postOrUpdateMessage({
	ts,
	channel,
	text,
	slackClient,
	threadTs,
	metadata,
}: {
	ts?: string;
	channel: string;
	text: string;
	slackClient: WebClient;
	threadTs?: string;
	metadata?: MessageMetadata;
}) {
	if (ts) {
		await slackClient.chat.update({
			metadata,
			text,
			ts,
			channel,
			mrkdwn: true,
		});
		return ts;
	}
	const { ts: newTs } = await slackClient.chat.postMessage({
		metadata,
		mrkdwn: true,
		text,
		...(threadTs ? { thread_ts: threadTs } : {}),
		channel,
	});
	assertExists(newTs, "newTs");
	return newTs;
}
