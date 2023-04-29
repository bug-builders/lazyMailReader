import { retrieveUserInformation } from "../data-accessors/user-information.js";
import { sign } from "../utils/basicCrypto.js";
import { postOrUpdateMessage } from "../utils/postOrUpdateMessage.js";
import { Services } from "../utils/setupServices.js";
import { assertExists } from "../utils/typing.js";
import { WebClient } from "../www.js";
import { downloadEmails } from "./downloadEmails.js";
import { indexEmails } from "./indexEmails.js";

export async function setupBot(
	services: Services,
	{
		user,
		team,
		slackClient,
		channel,
	}: { user: string; team: string; slackClient: WebClient; channel: string },
) {
	const userInformation = retrieveUserInformation(services, { team, user });
	if (!userInformation.openAIKey) {
		await slackClient.chat.postMessage({
			text: `Bonjour ${userInformation.displayName || "camarade"}!

Nous allons d'abord terminer de m'installer.
Afin de pouvoir continuer la discussion j'ai besoin d'une clé OpenAI...
Si tu peux juste me la coller là, ça me permettra d'être plus intelligent :D

Merci!
`,
			channel,
		});
		return false;
	}

	if (!userInformation.accessToken || !userInformation.refreshToken) {
		const authUrl = services.googleOauth2Client.generateAuthUrl({
			access_type: "offline",
			prompt: "consent",
			scope: ["https://www.googleapis.com/auth/gmail.readonly"],
			state: sign(services.config.SECRET_KEY, {
				team,
				user,
				channel,
				iat: Date.now(),
			}),
		});
		await slackClient.chat.postMessage({
			text: `J'ai maintenant besoin d'accéder à tes emails. Peux tu t'authentifier sur ce lien s'il te plait ?\n ${authUrl}`,
			channel,
		});
		return false;
	}

	if (
		!userInformation.emailAddress ||
		!userInformation.lastEmailsDownloadedAt ||
		!userInformation.lastIndexationDoneAt
	) {
		await slackClient.chat.postMessage({
			text: `Quelque chose s'est mal passé lors de mon dernier accès à tes emails, je vais réesayer...`,
			channel,
		});
		assertExists(userInformation.accessToken, "userInformation.accessToken");
		assertExists(userInformation.refreshToken, "userInformation.refreshToken");
		const { documents, ts } = await downloadEmails(services, {
			channel,
			slackClient,
			team,
			tokens: {
				accessToken: userInformation.accessToken,
				refreshToken: userInformation.refreshToken,
			},
			user,
		});

		const { ts: currentTs } = await indexEmails(services, {
			channel,
			documents,
			slackClient,
			team,
			user,
			ts,
		});

		await postOrUpdateMessage({
			ts: currentTs,
			channel,
			slackClient,
			text: "Et voilà, tout est okay pour moi ! Que souhaiterais tu savoir ?",
		});

		return false;
	}

	return true;
}
