import {
	retrieveUserInformation,
	saveUserInformation,
} from "../data-accessors/user-information.js";
import { selectLang } from "../i18n/index.js";
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
			text: selectLang(userInformation.lang).thxForContinuing,
			channel,
		});
	} else if (subscription.status === "canceled") {
		await slackClient.chat.postMessage({
			text: selectLang(userInformation.lang).sorryYouStopped,
			channel,
		});
	} else {
		await slackClient.chat.postMessage({
			text: selectLang(userInformation.lang).stripeProblem,
			channel,
		});
	}

	userInformation.stripeSubscriptionStatus = subscription.status;
	saveUserInformation(services, { user, team, userInformation });
}
