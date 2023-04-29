import { OpenAI } from "langchain/llms/openai";
import { DateTime } from "luxon";

export async function metadataDates(request: string): Promise<{
	startingDate: null | string;
	endingDate: null | string;
}> {
	const now = DateTime.now();

	const fewShotsPrompt = `Aujourd'hui, nous sommes le ${now.toISO()}
Vous êtes un analyste de données. Suite à une demande d'utilisateur, vous devez trouver une plage de dates pour filtrer des e-mails qui pourraient contenir des informations sur la demande.
Commencez par expliquer de quoi parle la demande et écrivez les dates au format ISO8601. Si vous ne pouvez pas produire de date, écrivez simplement null.

Demande:
"""
Que fait Emilie pour la Sthack?
"""
Cette demande concerne une personne nommée Emilie et un événement appelé Sthack. Il n'y a pas d'indice spécifique sur une date potentielle de l'événement, donc nous ne pouvons pas filtrer les e-mails par date.
{"startingDate": null, "endingDate": null}

Demande:
"""
Quel est le status de la commande de T-shirt que j'ai passé il y a 1 mois?
"""
Cette demande concerne une commande de T-Shirt que l'utilisateur a passé il y a 1 mois. L'utilisateur a spécifié une information temporelle relative, donc nous pouvons filtrer les e-mails par date de réception depuis 1 mois.
{"startingDate": "${now.minus({ month: 1 }).startOf("day").toISO()}", "endingDate": null}

Demande:
"""
Quel était le prix que l'on a négotié avec Damien en Q1?
"""
Cette demande concerne une négociation entre l'utilisateur et Damien concernant un prix. Nous ne connaissons pas le prix de quoi, mais nous savons que cela a été fait au premier trimestre de cette année.
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
			console.error("Wrong json", lastLine);
		}
	}
	return { startingDate: null, endingDate: null };
}
