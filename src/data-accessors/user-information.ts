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
	emailAddress?: string;
	loaderType?: string;
};

export function deleteUserInformation(
	services: Services,
	{ team, user }: { team: string; user: string },
) {
	const userInformationFile = join(
		services.config.userInformationDirectory,
		`/${team}-${user}.json`,
	);
	fs.rmSync(userInformationFile);
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
