import { Services } from "../utils/setupServices.js";
import fs from "fs";

export type UserInformation = {
	displayName?: string;
	accessToken?: string;
	refreshToken?: string;
	openAIKey?: string;
	lastEmailsDownloadedAt?: string; // ISO8601
	lastIndexationDoneAt?: string; // ISO8601
	emailAddress?: string;
};

export function retrieveUserInformation(
	services: Services,
	{ team, user }: { team: string; user: string },
): UserInformation {
	const userInformationFile = `${services.config.userInformationDirectory}/${team}-${user}.json`;

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
	const userInformationFile = `${services.config.userInformationDirectory}/${team}-${user}.json`;

	fs.writeFileSync(
		userInformationFile,
		JSON.stringify(userInformation),
		"utf-8",
	);
}
