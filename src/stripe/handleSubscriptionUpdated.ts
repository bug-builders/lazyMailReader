import {
	retrieveUserInformation,
	saveUserInformation,
} from "../data-accessors/user-information.js";
import { createSlackClientForTeam } from "../utils/createSlackClientForTeam.js";
import { Services } from "../utils/setupServices.js";
import { assertExists, assertIsString } from "../utils/typing.js";
import stripe from "stripe";

export async function handleSubscriptionUpdated(
	services: Services,
	{ event }: { event: stripe.Event },
) {
	const subscription = event.data.object as stripe.Subscription;
	assertIsString(subscription.customer);

	const customer = await services.stripeClient.customers.retrieve(
		subscription.customer,
	);
	if (customer.deleted) {
		throw new Error(`Deleted customer ${customer.id}`);
	}
	const { user, team, channel } = customer.metadata;

	assertExists(user, "user");
	assertExists(team, "team");
	assertExists(channel, "channel");

	const userInformation = retrieveUserInformation(services, {
		team,
		user,
	});
	userInformation.stripeSubscriptionStatus = subscription.status;
	const slackClient = createSlackClientForTeam(services, {
		team,
	});

	if (subscription.status === "active") {
		await slackClient.chat.postMessage({
			text: "Merci beaucoup de continuer à m'utiliser !",
			channel,
		});
	} else if (subscription.status === "canceled") {
		await slackClient.chat.postMessage({
			text: "Je suis navré que tu ne sois pas satisfait de mes services. Je vais essayer de m'améliorer, n'hésite pas à revenir dans quelques temps !",
			channel,
		});
	} else {
		await slackClient.chat.postMessage({
			text: "Quelque chose s'est mal passé avec votre subscription Stripe. Je vous invite à nous contacter pour débloquer la situation: contact@bug.builders",
			channel,
		});
	}

	userInformation.stripeSubscriptionStatus = subscription.status;
	saveUserInformation(services, { user, team, userInformation });
}
