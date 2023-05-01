import { OpenAI } from "langchain/llms/openai";
import { DateTime } from "luxon";

export async function metadataSubject(request: string): Promise<string> {
	const now = DateTime.now();

	const fewShotsPrompt = `Aujourd'hui, nous sommes le ${now.toISO()}
Vous êtes un analyste de données. Suite à une demande d'utilisateur, vous devez trouver un sujet pour filtrer des e-mails qui pourraient contenir des informations concernant la demande. 
Commencez par expliquer de quoi parle la demande et écrivez les sujets potentiels.

Demande:
"""
What Emilie is doing for the Sthack event?
"""
Cette demande concerne une personne nommée Emilie et un événement nommé Sthack. Un e-mail probable avec les sujets "Sthack", "événement" ou "Emilie" pourrait contenir des informations sur la demande de l'utilisateur.
{"sujet": "Sthack event Emilie"}

Demande:
"""
Quel est le status de la commande de T-shirt que j'ai passé il y a 1 mois?
"""
Cette demande concerne une commande de T-Shirt que l'utilisateur a passée il y a 1 mois. Les e-mails avec des sujets contenant "T-Shirt", "statut", "commande" pourraient correspondre.
{"sujet": "T-Shirt status command"}

demande:
"""
What was the price we negotiated with Damien in Q1?
"""
Cette demande concerne une négociation entre l'utilisateur et Damien concernant un prix. Les sujets d'e-mails intéressants peuvent contenir les mots "prix", "négociation", "Damien" et/ou "Q1".
{"sujet": "price negotiation Damien Q1"}

Demande:
"""
Peux-tu générer une réponse à l'email que j'ai reçu de la banque il y a 2 semaines?
"""
Cette demande concerne la génération d'une réponse à un e-mail reçu par l'utilisateur d'une banque il y a 2 semaines. Pour générer la réponse, un e-mail avec un sujet contenant "banque" doit être récupéré.
{"sujet": "banque"}

Demande:
"""
J'ai un pneu crevé et besoin de faire un suivi auprès de la compagnie d'assurance. Peux-tu me trouver le numéro de contrat de ma compagnie d'assurance ?
"""
Cette demande concerne l'obtention du numéro de contrat de la compagnie d'assurance de l'utilisateur. Les e-mails avec des sujets contenant "assurance" ou "numéro de contrat" peuvent être pertinents pour la demande de l'utilisateur.
{"sujet": "numéro contrat assurance"}`;

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
			return parsedResponse.sujet;
		} catch {
			console.error("Wrong json subject fr", lastLine);
		}
	}
	return "";
}
