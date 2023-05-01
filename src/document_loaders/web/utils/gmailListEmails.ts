import { assertExists } from "../../../utils/typing.js";
import fs from "fs";
import { Common, google } from "googleapis";

export async function gmailListEmails({
	oauth2Client,
	refreshToken,
	accessToken,
	googleEmlPath = "./eml-files",
	progressCallback,
}: {
	oauth2Client: Common.OAuth2Client;
	refreshToken: string;
	accessToken: string;
	googleEmlPath?: string;
	progressCallback?: ({
		index,
		total,
	}: { index: number; total: number }) => Promise<void>;
}) {
	oauth2Client.setCredentials({
		refresh_token: refreshToken,
		access_token: accessToken,
	});

	const gmail = google.gmail({ version: "v1", auth: oauth2Client });

	const response = await gmail.users.messages.list({
		userId: "me",
		maxResults: 500,
		q: "category:primary",
	});

	const messages = response.data.messages;

	assertExists(messages, "messages");
	const emlList: { filename: string; threadId: string; id: string }[] = [];
	let i = 0;
	for (const message of messages) {
		if (progressCallback) {
			await progressCallback({
				index: i,
				total: messages.length,
			});
		}
		i += 1;
		if (!message.id || !message.threadId) {
			continue;
		}
		const emlFilePath = `${googleEmlPath}/email_${message.id}.eml`;
		if (fs.existsSync(emlFilePath)) {
			emlList.push({
				filename: emlFilePath,
				threadId: message.threadId,
				id: message.id,
			});
			continue;
		}

		const messageData = await gmail.users.messages.get({
			userId: "me",
			id: message.id,
			format: "raw",
		});
		if (!messageData.data.raw) {
			continue;
		}

		const messageId = messageData.data.id;
		const emlContent = Buffer.from(messageData.data.raw, "base64").toString(
			"utf-8",
		);
		fs.writeFileSync(emlFilePath, emlContent);
		emlList.push({
			filename: emlFilePath,
			threadId: message.threadId,
			id: message.id,
		});
	}
	return emlList;
}
