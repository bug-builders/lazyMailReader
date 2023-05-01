import { OpenAI } from "langchain/llms/openai";
import { DateTime } from "luxon";

export async function metadataDates(request: string): Promise<{
	startingDate: null | string;
	endingDate: null | string;
}> {
	const now = DateTime.now();

	const fewShotsPrompt = `Today is ${now.toISO()}
You are a data analyst. Providing a user request, you have to find a date range to filter some emails that may contain information about the request.
Start by explaining what the request is about and write the dates in ISO8601 format. If you can't produce any date just write null.

Request:
"""
What Emilie is doing for the Sthack event?
"""
This request is about a person named Emilie and an event named Sthack. There is no specific hint about a potential date of the event so we can't filter emails by date.
{"startingDate": null, "endingDate": null}

Request:
"""
Quel est le status de la commande de T-shirt que j'ai passé il y a 1 mois?
"""
This request is about a T-Shirt order the user made 1 month ago. The user specified a time relative information so we can filter emails by date received since 1 month.
{"startingDate": "${now.minus({ month: 1 }).startOf("day").toISO()}", "endingDate": null}

Request:
"""
What was the price we negotiated with Damien in Q1?
"""
This request is about a negotiation between the user and Damien regarding a price. We don't know the price of what but we know it was done in the first quarter of this year.
{"startingDate": "${now.startOf("year").toISO()}", "endingDate": "${now
		.startOf("year")
		.plus({ quarter: 1 })
		.toISO()}"}`;

	const model = new OpenAI({ temperature: 0 });

	const response = await model.call(
		`${fewShotsPrompt}\n\nRequest:
"""
${request}
"""`,
	);

	const lastLine = response.split("\n").at(-1);

	if (lastLine) {
		try {
			const parsedResponse = JSON.parse(lastLine);
			return parsedResponse;
		} catch {
			console.error("Wrong json date", lastLine);
		}
	}
	return { startingDate: null, endingDate: null };
}
