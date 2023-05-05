import {
	UserInformation,
	retrieveUserInformation,
} from "../data-accessors/user-information.js";
import { selectLang } from "../i18n/index.js";
import { CryptoUsage, sign } from "../utils/basicCrypto.js";
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
		lang,
	}: {
		user: string;
		team: string;
		slackClient: WebClient;
		channel: string;
		lang: UserInformation["lang"];
	},
) {
	const userInformation = retrieveUserInformation(services, { team, user });
	if (!userInformation.openAIKey) {
		await slackClient.chat.postMessage({
			text: `${selectLang(lang).hello} ${
				userInformation.displayName || "camarade"
			}!

${selectLang(lang).prompt.askForKey}
`,
			channel,
		});
		return false;
	}

	if (
		!userInformation.accessToken ||
		!userInformation.refreshToken ||
		!userInformation.loaderType
	) {
		const state = {
			team,
			user,
			channel,
			iat: Date.now(),
		};

		const gmailAuthUrl = await services.gmailLoader.getAuthorizationUrl(
			sign(services.config.SECRET_KEY, CryptoUsage.Oauth2, {
				...state,
				type: "gmail",
			}),
		);

		const msAuthUrl = await services.msLoader.getAuthorizationUrl(
			sign(services.config.SECRET_KEY, CryptoUsage.Oauth2, {
				...state,
				type: "ms",
			}),
		);

		await slackClient.chat.postMessage({
			text: `${selectLang(lang).prompt.needEmailAccess}\n
<${gmailAuthUrl}|Gmail> | <${msAuthUrl}|Office365>`,
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
			text: selectLang(lang).somethingWentWrong,
			channel,
		});
		assertExists(userInformation.accessToken, "userInformation.accessToken");
		assertExists(userInformation.refreshToken, "userInformation.refreshToken");
		const { documents, ts } = await downloadEmails(services, {
			channel,
			loaderType: userInformation.loaderType,
			slackClient,
			team,
			tokens: {
				accessToken: userInformation.accessToken,
				refreshToken: userInformation.refreshToken,
			},
			user,
			lang: userInformation.lang,
		});

		const { ts: currentTs } = await indexEmails(services, {
			channel,
			documents,
			slackClient,
			team,
			user,
			ts,
			lang: userInformation.lang,
		});

		await postOrUpdateMessage({
			ts: currentTs,
			channel,
			slackClient,
			text: selectLang(lang).allGood,
		});

		return false;
	}

	return true;
}
