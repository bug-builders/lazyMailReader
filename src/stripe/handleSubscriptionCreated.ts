import {
	retrieveUserInformation,
	saveUserInformation,
} from "../data-accessors/user-information.js";
import { createSlackClientForTeam } from "../utils/createSlackClientForTeam.js";
import { Services } from "../utils/setupServices.js";
import { assertExists, assertIsString } from "../utils/typing.js";
import bolt from "@slack/bolt";
import { readFileSync } from "fs";
import { join } from "path";
import stripe from "stripe";

export async function handleSubscriptionCreated(
	services: Services,
	{ event }: { event: stripe.Event },
) {
	const subscription = event.data.object as stripe.Subscription;
	assertIsString(subscription.customer);

	const checkoutSessionList =
		await services.stripeClient.checkout.sessions.list({
			subscription: subscription.id,
		});

	const checkoutSession = checkoutSessionList.data.find(
		(cS) => cS.status === "complete",
	);

	const clientReferenceId = checkoutSession?.client_reference_id;
	assertExists(clientReferenceId, "clientReferenceId");

	const [team, user] = clientReferenceId.split("-");

	assertIsString(team);
	assertIsString(user);

	const userInformation = retrieveUserInformation(services, {
		team,
		user,
	});

	assertExists(userInformation.channel, "userInformation.channel");

	userInformation.stripeCustomerId = subscription.customer;
	userInformation.stripeSubscriptionStatus = subscription.status;

	saveUserInformation(services, { user, team, userInformation });

	await services.stripeClient.customers.update(subscription.customer, {
		metadata: { user, team, channel: userInformation.channel },
	});

	const slackClient = createSlackClientForTeam(services, { team });

	await slackClient.chat.postMessage({
		text: "Merci beaucoup de me faire confiance. Je vais tâcher de ne pas te décevoir ! Tu peux maintenant me poser autant de question que tu veux.",
		channel: userInformation.channel,
	});
}
