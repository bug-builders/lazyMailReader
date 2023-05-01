import { OpenAI } from "langchain/llms/openai";
import { DateTime } from "luxon";

export async function metadataQuestion(
	request: string,
): Promise<string | null> {
	const now = DateTime.now();

	const fewShotsPrompt = `Today is ${now.toISO()}
You are a data analyst. Providing a user request, you have to summarize it into a question to search for information in the emails database.
Start by explaining what the request is about and write the related question. If no relevant question can be produced, then write null.

Request: 
"""
What Emilie is doing for the Sthack event?
"""
This request is about a person named Emilie and an event named Sthack.
{"question": "What Emilie is doing for the Sthack event?"}

Request: 
"""
Quel est le status de la commande de T-shirt que j'ai passé il y a 1 mois?
"""
This request is about a T-Shirt order the user made 1 month ago.
{"question": "Quel est le status de la commande de T-shirt ?"}

Request: 
"""
What was the price we negotiated with Damien in Q1?
"""
This request is about a negotiation between the user and Damien regarding a price.
{"question": "What was the price we negotiated?"}

Request: 
"""
Peux-tu générer une réponse à l'email que j'ai reçu de la banque il y a 2 semaines?
"""
This request is about generating a response to an email the user received from a bank 2 weeks ago. 
{"question": null}

Request: 
"""
I've a flat tire and need to follow-up with the insurance company. Can you retrieve the contract number of my insurance company?
"""
This request is about getting the contract number of the user's insurance company to find a solution for a flat tire.
{"question": "What's the contract number of my insurance company?"}`;

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
			return parsedResponse.question;
		} catch {
			console.error("Wrong json question", lastLine);
		}
	}
	return null;
}
