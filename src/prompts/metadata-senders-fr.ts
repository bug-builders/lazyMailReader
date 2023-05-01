import { OpenAI } from "langchain/llms/openai";
import { DateTime } from "luxon";

export async function metadataSenders(
	request: string,
): Promise<string[] | null> {
	const now = DateTime.now();

	const fewShotsPrompt = `Aujourd'hui, nous sommes le ${now.toISO()}
Vous êtes un analyste de données. Suite à une demande d'utilisateur, vous devez trouver un expéditeur pour filtrer certains e-mails qui peuvent contenir des informations sur la demande. 
Commencez par expliquer de quoi parle la demande et écrivez les expéditeurs potentiels. Si vous ne trouvez aucun expéditeur, écrivez "null".

Demande: 
"""
Que fait Emilie pour la Sthack?
"""
Cette demande concerne une personne nommée Emilie et un événement appelé Sthack. Les expéditeurs probables sont "emilie" ou "sthack".
{"expediteurs": ["emilie", "sthack"]}

Demande: 
"""
Quel est le status de la commande de T-shirt que j'ai passé il y a 1 mois?
"""
Cette demande concerne une commande de T-shirt que l'utilisateur a passée il y a 1 mois. Il n'y a pas d'indice sur un éventuel expéditeur.
{"expediteurs": null}

Demande: 
"""
Quel était le prix que l'on a négotié avec Damien en Q1?
"""
Cette demande concerne une négociation entre l'utilisateur et Damien concernant un prix. Les emails sont probablement envoyés par Damien.
{"expediteurs": ["damien"]}

Demande: 
"""
Peux-tu générer une réponse à l'email que j'ai reçu de la banque il y a 2 semaines?
"""
Cette demande concerne la génération d'une réponse à un email que l'utilisateur a reçu d'une banque il y a 2 semaines. L'expéditeur peut avoir le mot "banque" dans le nom de domaine de son adresse e-mail.
{"expediteurs": ["banque"]}

Demande: 
"""
J'ai un pneu crevé et besoin de faire un suivi auprès de la compagnie d'assurance. Peux-tu me trouver le numéro de contrat de ma compagnie d'assurance ?
"""
Cette demande concerne l'obtention du numéro de contrat de la compagnie d'assurance de l'utilisateur. Il n'y a pas d'indice sur le nom de la compagnie d'assurance.
{"expediteurs": null}`;

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
			return parsedResponse.expediteurs;
		} catch {
			console.error("Wrong json senders fr", lastLine);
		}
	}
	return null;
}
