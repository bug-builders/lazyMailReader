import { Client, GraphError } from "@microsoft/microsoft-graph-client";
import fs from "fs";

export async function msListEmails({
	msClient,
	emlPath = "./eml-files",
	progressCallback,
}: {
	msClient: Client;
	emlPath?: string;
	progressCallback?: ({
		index,
		total,
	}: { index: number; total: number }) => Promise<void>;
}) {
	const messages: { value: { id: string; conversationId: string }[] } =
		await msClient
			.api("/me/messages")
			.version("v1.0")
			.select("id,conversationId")
			.filter("isDraft eq false")
			.orderby("receivedDateTime DESC")
			.top(500)
			.get();

	const emlList: { filename: string; threadId: string; id: string }[] = [];
	let i = 0;
	for (const message of messages.value) {
		if (progressCallback) {
			await progressCallback({
				index: i,
				total: messages.value.length,
			});
		}
		i += 1;
		if (!message.id || !message.conversationId) {
			continue;
		}
		const emlFilePath = `${emlPath}/email_${message.id}.eml`;
		if (fs.existsSync(emlFilePath)) {
			emlList.push({
				filename: emlFilePath,
				threadId: message.conversationId,
				id: message.id,
			});
			continue;
		}

		try {
			const messageData = await msClient
				.api(`/me/messages/${message.id}/$value`)
				.version("v1.0")
				.get();

			fs.writeFileSync(emlFilePath, messageData);
			emlList.push({
				filename: emlFilePath,
				threadId: message.conversationId,
				id: message.id,
			});
		} catch (error) {
			if (error instanceof GraphError && error.code === "ErrorItemNotFound") {
				console.error(`Message ${message.id} not found`);
			} else {
				throw error;
			}
		}
	}
	return emlList;
}
