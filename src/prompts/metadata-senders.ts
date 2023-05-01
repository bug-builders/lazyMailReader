import { OpenAI } from "langchain/llms/openai";
import { DateTime } from "luxon";

export async function metadataSenders(
	request: string,
): Promise<string[] | null> {
	const now = DateTime.now();

	const fewShotsPrompt = `Today is ${now.toISO()}
You are a data analyst. Providing a user request, you have to find a sender to filter some emails that may contain information about the request.
Start by explaining what the request is about and write the potential senders. If you can't find any sender, write null.

Request: 
"""
What Emilie is doing for the Sthack event?
"""
This request is about a person named Emilie and an event named Sthack. Probable senders are "emilie" or "sthack".
{"senders": ["emilie", "sthack"]}

Request: 
"""
Quel est le status de la commande de T-shirt que j'ai passé il y a 1 mois?
"""
This request is about a T-Shirt order the user made 1 month ago. There is no hint about a potential sender.
{"senders": null}

Request: 
"""
What was the price we negotiated with Damien in Q1?
"""
This request is about a negotiation between the user and Damien regarding a price. The emails are probably sent by Damien.
{"senders": ["damien"]}

Request: 
"""
Peux-tu générer une réponse à l'email que j'ai reçu de la banque il y a 2 semaines?
"""
This request is about generating a response to an email the user received from a bank 2 weeks ago. Sender may have the word "banque" in the domain name of their email address.
{"senders": ["banque"]}

Request: 
"""
I've a flat tire and need to follow-up with the insurance company. Can you retrieve the contract number of my insurance company?
"""
This request is about getting the contract number of the user's insurance company. There is no hint about the insurance company name.
{"senders": null}`;

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
			return parsedResponse.senders;
		} catch {
			console.error("Wrong json senders", lastLine);
		}
	}
	return null;
}
