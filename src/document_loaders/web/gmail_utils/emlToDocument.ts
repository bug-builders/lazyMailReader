import { LazyMailReaderMetadata } from "../../../vectorstores/lazyMailReader.js";
// @ts-ignore
import EmlParser from "eml-parser";
import fs from "fs";
import { Document } from "langchain/document";
import { NodeHtmlMarkdown } from "node-html-markdown";

export async function emlToDocument(eml: {
	filename: string;
	threadId: string;
	id: string;
}) {
	const email = await new EmlParser(fs.createReadStream(eml.filename)).parseEml(
		{
			ignoreEmbedded: true,
		},
	);

	const subject = email.headers.get("subject");
	const emailHtml: string = email.html ?? email.text;

	const emailText: string =
		email.text ?? NodeHtmlMarkdown.translate(email.html);

	const content = `Subject: ${subject}
From: ${email.from.text}

${emailText}`;

	const metadata: LazyMailReaderMetadata = {
		isHtml: Boolean(!email.text),
		emailText: content,
		emailHtml,
		subject,
		...(email.from
			? {
					fromAddress: email.from.value.map(
						(value: { address: string }) => value.address,
					),
					fromName: email.from.value.map(
						(value: { name: string }) => value.name,
					),
			  }
			: {}),
		...(email.to
			? {
					toAddress: email.to.value.map(
						(value: { address: string }) => value.address,
					),
					toName: email.to.value.map((value: { name: string }) => value.name),
			  }
			: {}),
		...(email.cc
			? {
					ccAddress: email.cc.value.map(
						(value: { address: string }) => value.address,
					),
					ccName: email.cc.value.map((value: { name: string }) => value.name),
			  }
			: {}),
		date: new Date(email.headers.get("date")),
		threadId: eml.threadId,
		id: eml.id,
	};

	return new Document<LazyMailReaderMetadata>({
		metadata,
		pageContent: content,
	});
}
