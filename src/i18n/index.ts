export const I18N = {
	en: {
		systemPrompt:
			"You will be provided with a list of emails to use as context. Your goal is to answer the user question based on this context.",
		myEmail: "My email is",
		initialQuestion: "What do you want to know from your emails?",
		fetchEmailsQuestion: "Do you want to fetch your last emails",
		currentDate: "Current date time is",
		syncEmails: "Alright, I'm going to read your latest emails...",
		allForgotten:
			"And there you go, I've completely forgotten about your emails. Don't hesitate to come back and take advantage of my services!",
		allGood: "I'm done reading! What do you want to know?",
		timeToPay:
			"I am truly sorry, but you have reached the limit of discovery questions. If you want to continue, please register by following this <{stripe_link}|Stripe link>.",
		lastSyncTime: "Last email synchronization: {date}",
		emailNotSync: "Emails not synchronized",
		synchronize: "Synchronize",
		deleteData: "⚠️ Delete all my data ⚠️",
		stripeAccess:
			"You can access your invoices and manage your Stripe subscription from <{stripe_portal}|their portal>.",
		lang: "Lang",
		changeLang: "Change your lang",
		countEmail: "I have {count} emails in memory.",
		openAIKey: "OpenAI Key",
		emailAccess: "Email access",
		thxForTheKey: "Thank you. Let me check if it properly works...",
		hello: "Hi",
		prompt: {
			baseSystem:
				"You are the personal email assistant of {displayName}. You have a list of emails that may contain the answer to {displayName}'s question. Your goal is to read and then respond to {displayName} as best as you can.",
			askForKey: `We will first finish setting me up.
				In order to continue the discussion, I need an OpenAI key...
				If you could just paste it here, it will allow me to be smarter :D
				Thank you!`,
			hereIsTheKey: "Here is the key",
			presentYourself:
				"Introduce yourself and tell me directly an anecdote about the inventor of emails without reminding me that I asked for it.",
			needEmailAccess:
				"I now need access to your emails. Can you please authenticate yourself on one of these links?",
			startEmailProcessing:
				"Perfect, I have everything I need!\nGive me a few minutes to read your emails, and I'll get back to you as soon as I'm ready...",
			subjectFilter: "Looking for email with subject",
			periodFilter: "During",
			sentBy: "Sent by",
			system: `You are the personal email assistant of {displayName} <{emailAddress}>.
Your goal is to read their emails and respond to {displayName} as best as you can.`,
			human: `I am {displayName} <{emailAddress}>, today is {currentDate}.
{question}`,
			list: "Here is a list of emails that may contain the answer to my request.",
			goAnswer: "You can now answer the request",
		},
		oopsDidntWork: "Oops, that didn't work. Can you try again?",
		somethingWentWrong:
			"Something went wrong during my last access to your emails, I will try again...",
		reading: "Reading",
		contactSupport:
			"Something went wrong. I will contact support and get back to you...",
		downloading: "Downloading",
		accessRevoked: "The access to emails has been revoked...",
		thxForPaying:
			"Thank you very much for trusting me. I will try not to disappoint you! You can now ask me as many questions as you want.",
		thxForContinuing: "Thank you very much for continuing to use me!",
		sorryYouStopped:
			"I am sorry that you are not satisfied with my services. I will try to improve, please don't hesitate to come back in some time!",
		stripeProblem:
			"Something went wrong with your Stripe subscription. I invite you to contact us to resolve the situation: contact@bug.builders",
	},
	fr: {
		systemPrompt:
			"Voici une liste d'e-mails reçu par un utilisateur. Votre objectif est de répondre à la question de l'utilisateur en vous basant sur ces emails.",
		myEmail: "Mon addresse email est",
		initialQuestion: "Que souhaitez vous demander à vos emails?",
		fetchEmailsQuestion: "Voulez vous récupérer vos derniers emails?",
		currentDate: "Nous somme le",
		syncEmails: "Très bien, je vais aller lire tes derniers emails...",
		allForgotten:
			"Et voilà, j'ai tout oublié à propos de tes emails. N'hésites pas à revenir profiter de mes services !",
		allGood: "Et voilà... Que souhaiterais tu savoir?",
		timeToPay:
			"Je suis vraiment navré mais tu as atteint la limite de questions de découverte.\nSi tu veux continuer merci de t'enregistrer en suivant ce <{stripe_link}|lien Stripe>.",
		lastSyncTime: "Dernière synchronisation des emails: {date}",
		emailNotSync: "Emails non synchronisé",
		synchronize: "Synchroniser",
		deleteData: "⚠️ Effacer mes données ⚠️",
		stripeAccess:
			"Vous pouvez accéder à vos factures et gérer votre subscription Stripe depuis <{stripe_portal}|leur portail>.",
		lang: "Langue",
		changeLang: "Changer de langue",
		countEmail: "J'ai en mémoire {count} de tes emails.",
		openAIKey: "Clé OpenAI",
		emailAccess: "Accès aux emails",
		thxForTheKey:
			"Merci, laisse moi vérifier si elle fonctionne correctement...",
		hello: "Bonjour",
		prompt: {
			baseSystem:
				"Tu es l'assistant personnel des emails de {displayName}. Tu as une liste d'emails pouvant contenir la réponse à la question de {displayName}. Ton but est de lire puis de répondre à {displayName} du mieux que tu peux.",
			askForKey: `Nous allons d'abord terminer de m'installer.
Afin de pouvoir continuer la discussion j'ai besoin d'une clé OpenAI...
Si tu peux juste me la coller là, ça me permettra d'être plus intelligent :D
Merci!`,
			hereIsTheKey: "Voici la clé",
			presentYourself:
				"Présentes toi et raconte moi directement une anectode sur l'inventeur des emails sans me rappeler que je te l'ai demandé.",
			needEmailAccess:
				"J'ai maintenant besoin d'accéder à tes emails. Peux tu t'authentifier sur un de ces liens s'il te plait ?",
			startEmailProcessing:
				"Parfait, j'ai tout ce qu'il me faut !\nLaisse moi quelques minutes pour lire tes mails et je reviens vers toi dès que je suis prêt...",
			subjectFilter: "Recherche d'emails ayant pour sujet",
			periodFilter: "Sur la période",
			sentBy: "Envoyés par",
			system: `Tu es l'assistant personnel des emails de {displayName} <{emailAddress}>.
Ton but est de lire ses emails puis de répondre à {displayName} du mieux que tu peux.`,
			human: `Je suis {displayName} <{emailAddress}>, nous somme le {currentDate}.
{question}`,
			list: `Voici une liste d'emails pouvant contenir la réponse à ma demande.`,
			goAnswer: "Tu peux maintenant répondre à la demande",
		},
		somethingWentWrong:
			"Quelque chose s'est mal passé lors de mon dernier accès à tes emails, je vais réesayer...",
		oopsDidntWork: "Oups, cela n'a pas fonctionné. Peux tu réessayer ?",
		reading: "Lecture",
		contactSupport:
			"Quelque chose s'est mal passé. Je vais contacter le support et je reviens vers toi...",
		downloading: "Téléchargement",
		accessRevoked: "L'accès aux emails a été révoqué...",
		thxForPaying:
			"Merci beaucoup de me faire confiance. Je vais tâcher de ne pas te décevoir ! Tu peux maintenant me poser autant de question que tu veux.",
		thxForContinuing: "Merci beaucoup de continuer à m'utiliser !",
		sorryYouStopped:
			"Je suis navré que tu ne sois pas satisfait de mes services. Je vais essayer de m'améliorer, n'hésite pas à revenir dans quelques temps !",
		stripeProblem:
			"Quelque chose s'est mal passé avec votre subscription Stripe. Je vous invite à nous contacter pour débloquer la situation: contact@bug.builders",
	},
};

export function selectLang(lang?: "fr" | "en") {
	return I18N[lang ?? "fr"];
}
