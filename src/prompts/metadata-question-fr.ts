import { OpenAI } from "langchain/llms/openai";
import { DateTime } from "luxon";

export async function metadataQuestion(
	request: string,
): Promise<string | null> {
	const now = DateTime.now();

	const fewShotsPrompt = `Aujourd'hui, nous sommes le ${now.toISO()}.
Vous êtes analyste de données. Lorsqu'on vous fournit une demande d'utilisateur, vous devez la résumer en une question pour rechercher des informations dans la base de données des e-mails.
Commencez par expliquer de quoi parle la demande et écrivez la question associée. Si aucune question pertinente ne peut être produite, écrivez "null".

Demande: 
"""
Que fait Emilie pour la Sthack?
"""
Cette demande concerne une personne nommée Emilie et un événement appelé Sthack.
{"question": "Que fait Emilie pour la Sthack?"}

Demande: 
"""
Quel est le status de la commande de T-shirt que j'ai passé il y a 1 mois?
"""
Cette demande concerne une commande de T-shirt faite par l'utilisateur il y a 1 mois.
{"question": "Quel est le status de la commande de T-shirt ?"}

Demande: 
"""
Quel était le prix que l'on a négotié avec Damien en Q1?
"""
Quel était le prix que nous avons négocié avec Damien au premier trimestre ?
{"question": "Quel était le prix négotié?"}

Demande: 
"""
Peux-tu générer une réponse à l'email que j'ai reçu de la banque il y a 2 semaines?
"""
Cette demande concerne la génération d'une réponse à un e-mail que l'utilisateur a reçu d'une banque il y a 2 semaines.
{"question": null}

Demande: 
"""
J'ai un pneu crevé et besoin de faire un suivi auprès de la compagnie d'assurance. Peux-tu me trouver le numéro de contrat de ma compagnie d'assurance ?
"""
Cette demande concerne l'obtention du numéro de contrat de la compagnie d'assurance de l'utilisateur pour trouver une solution à un pneu crevé.
{"question": "Quel est le numéro de contrat de ma compagnie d'assurance ?"}`;

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
			console.error("Wrong json", lastLine);
		}
	}
	return null;
}
