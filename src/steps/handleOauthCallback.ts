import {
	retrieveUserInformation,
	saveUserInformation,
} from "../data-accessors/user-information.js";
import { CryptoUsage, verify } from "../utils/basicCrypto.js";
import { STATE_EXPIRATION_MS } from "../utils/constant.js";
import { createSlackClientForTeam } from "../utils/createSlackClientForTeam.js";
import { postOrUpdateMessage } from "../utils/postOrUpdateMessage.js";
import { Services } from "../utils/setupServices.js";
import {
	assertExists,
	assertIsNumber,
	assertIsString,
} from "../utils/typing.js";
import { WebClient } from "../www.js";
import { downloadEmails } from "./downloadEmails.js";
import { indexEmails } from "./indexEmails.js";
import bolt from "@slack/bolt";
import { readFileSync } from "fs";
import { join } from "path";

export async function handleOauthCallback(
	tokens: { accessToken: string; refreshToken: string },
	state: string | null,
	services?: Services,
) {
	assertExists(services, "services");
	let channel: string | undefined;
	let slackClient: WebClient | undefined;
	try {
		assertExists(state, "state");
		const {
			team,
			user,
			channel: verifiedChannel,
			iat,
			type,
		} = verify(services.config.SECRET_KEY, CryptoUsage.Oauth2, state);
		assertIsString(team);
		assertIsString(user);
		assertIsString(verifiedChannel);
		assertIsString(type);
		assertIsNumber(iat);

		if (type !== "ms" && type !== "gmail") {
			throw new Error("Invalid state type");
		}
		if (Date.now() - iat > STATE_EXPIRATION_MS) {
			throw new Error("State expired");
		}
		channel = verifiedChannel;
		const userInformation = retrieveUserInformation(services, {
			team,
			user,
		});
		assertExists(userInformation, "userInformation");

		userInformation.accessToken = tokens.accessToken;
		userInformation.refreshToken = tokens.refreshToken;
		userInformation.loaderType = type;
		saveUserInformation(services, { team, user, userInformation });

		slackClient = createSlackClientForTeam(services, { team });

		await slackClient.chat.postMessage({
			text: "Parfait, j'ai tout ce qu'il me faut !\nLaisse moi quelques minutes pour lire tes mails et je reviens vers toi dès que je suis prêt...",
			channel,
		});

		const { documents, ts } = await downloadEmails(services, {
			channel,
			loaderType: type,
			slackClient,
			team,
			tokens,
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
			text: "Et bien je crois que j'ai tout lu... Que souhaiterais tu savoir?",
		});
	} catch (error) {
		console.error(error);
		if (channel && slackClient) {
			await postOrUpdateMessage({
				channel,
				slackClient,
				text: "Je suis désolé, quelque chose s'est mal passé... Je vais contacter le support pour savoir ce qu'il s'est passé",
			});
		}
	}
}
