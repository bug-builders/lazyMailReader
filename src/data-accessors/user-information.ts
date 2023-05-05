import { Services } from "../utils/setupServices.js";
import fs from "fs";
import { join } from "path";

export type UserInformation = {
	channel?: string;
	displayName?: string;
	accessToken?: string;
	refreshToken?: string;
	openAIKey?: string;
	lastQueryAt?: string; // ISO8601
	lastEmailsDownloadedAt?: string; // ISO8601
	lastIndexationDoneAt?: string; // ISO8601
	queryCount?: number;
	emailAddress?: string;
	loaderType?: string;
	stripeCustomerId?: string;
	stripeSubscriptionStatus?: string;
	lang?: "en" | "fr";
};

export function deleteUserInformation(
	services: Services,
	{ team, user }: { team: string; user: string },
) {
	const userInformation = retrieveUserInformation(services, { team, user });
	saveUserInformation(services, {
		team,
		user,
		userInformation: {
			lang: userInformation.lang,
			channel: userInformation.channel,
			queryCount: userInformation.queryCount,
			emailAddress: userInformation.emailAddress,
			stripeCustomerId: userInformation.stripeCustomerId,
		},
	});
}

export function retrieveUserInformation(
	services: Services,
	{ team, user }: { team: string; user: string },
): UserInformation {
	const userInformationFile = join(
		services.config.userInformationDirectory,
		`/${team}-${user}.json`,
	);

	try {
		return JSON.parse(fs.readFileSync(userInformationFile, "utf-8"));
	} catch {}
	return {};
}

export function saveUserInformation(
	services: Services,
	{
		team,
		user,
		userInformation,
	}: { team: string; user: string; userInformation: UserInformation },
) {
	const userInformationFile = join(
		services.config.userInformationDirectory,
		`/${team}-${user}.json`,
	);

	fs.writeFileSync(
		userInformationFile,
		JSON.stringify(userInformation),
		"utf-8",
	);
}
