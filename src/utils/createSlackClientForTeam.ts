import { Services } from "./setupServices.js";
import { assertExists } from "./typing.js";
import bolt from "@slack/bolt";
import { readFileSync } from "fs";
import { join } from "path";

export function createSlackClientForTeam(
	services: Services,
	{ team }: { team: string },
) {
	const storePath = join(
		services.config.userInformationDirectory,
		`/${team}.json`,
	);
	const botInstallation: bolt.Installation = JSON.parse(
		readFileSync(storePath, "utf-8"),
	);

	const botToken = botInstallation.bot?.token;
	assertExists(botToken, "botToken");

	const authenticatedApp = new bolt.App({
		signingSecret: services.config.SLACK_SIGNING_SECRET,
		token: botToken,
	});
	return authenticatedApp.client;
}
