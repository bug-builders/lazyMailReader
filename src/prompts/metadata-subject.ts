import { OpenAI } from "langchain/llms/openai";
import { DateTime } from "luxon";

export async function metadataSubject(request: string): Promise<string> {
	const now = DateTime.now();

	const fewShotsPrompt = `Today is ${now.toISO()}
You are a data analyst. Providing a user request, you have to find a subject to filter some emails that may contain information about the request.
Start by explaining what the request is about and write the potential subjects.

Request:
"""
What Emilie is doing for the Sthack event?
"""
This request is about a person named Emilie and an event named Sthack. Probable email with subjects "Sthack", "event" or "Emilie" could contain information about the user request
{"subject": "Sthack event Emilie"}

Request:
"""
Quel est le status de la commande de T-shirt que j'ai passé il y a 1 mois?
"""
This request is about a T-Shirt order the user made 1 month ago. Email with subjects containing "T-Shirt", "status", "commande" could match.
{"subject": "T-Shirt status command"}

Request:
"""
What was the price we negotiated with Damien in Q1?
"""
This request is about a negotiation between the user and Damien regarding a price. Interesting email subject may contain the words "price", "negotiation", "Damien" and or "Q1".
{"subject": "price negotiation Damien Q1"}

Request:
"""
Peux-tu générer une réponse à l'email que j'ai reçu de la banque il y a 2 semaines?
"""
This request is about generating a response to an email the user received from a bank 2 weeks ago. To generate the response, email with subject containing "banque" should be retrieved.
{"subject": "banque"}

Request:
"""
I've a flat tire and need to follow-up with the insurance company. Can you retrieve the contract number of my insurance company?
"""
This request is about getting the contract number of the user's insurance company. Email with subject containing "insurance" or "contract number" may be relevant to the user's request.
{"subject": "insurance contract number"}`;

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
			return parsedResponse.subject;
		} catch {
			console.error("Wrong json", lastLine);
		}
	}
	return "";
}
