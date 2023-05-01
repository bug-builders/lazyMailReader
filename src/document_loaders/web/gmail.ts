import { LazyMailReaderMetadata } from "../../vectorstores/lazyMailReader.js";
import { emlToDocuments } from "./utils/emlToDocuments.js";
import { gmailListEmails } from "./utils/gmailListEmails.js";
import { wrapHandleOauthCallback } from "./utils/wrapHandleOauthCallback.js";
import fs from "fs";
import { google } from "googleapis";
import http from "http";
import { Document } from "langchain/document";
import { BaseDocumentLoader } from "langchain/document_loaders/base";

export interface GmailLoaderParams {
	googleClientId: string;
	googleClientSecret: string;
	googleRedirectUri: string;
}

export class GmailLoader extends BaseDocumentLoader implements GmailLoaderParams {
	public googleClientId: string;
	public googleClientSecret: string;
	public googleRedirectUri: string;

	constructor({
		googleClientId,
		googleClientSecret,
		googleRedirectUri,
	}: GmailLoaderParams) {
		super();
		this.googleClientId = googleClientId;
		this.googleClientSecret = googleClientSecret;
		this.googleRedirectUri = googleRedirectUri;
	}

	public async load(options?: {
		userId: string;
		tokens: { accessToken: string; refreshToken: string };
		emlPath: string;
		progressCallback?: ({
			index,
			total,
		}: { index: number; total: number }) => Promise<void>;
	}): Promise<Document<LazyMailReaderMetadata>[]> {
		if (!options?.userId || !options?.tokens || !options?.emlPath) {
			throw new Error("Missing options");
		}
		const emlList = await gmailListEmails({
			progressCallback: options?.progressCallback,
			oauth2Client: this.getGoogleOauth2Client(),
			accessToken: options.tokens.accessToken,
			refreshToken: options.tokens.refreshToken,
			googleEmlPath: options.emlPath,
		});

		const allDocuments: Document<LazyMailReaderMetadata>[] = [];
		let i = 0;
		for (const eml of emlList) {
			const document = await emlToDocuments(options.userId, eml);
			i = +1;
			allDocuments.push(document);
		}

		return allDocuments;
	}

	public async getUserEmailAddress({
		refreshToken,
		accessToken,
	}: {
		accessToken: string;
		refreshToken: string;
	}) {
		const oauth2Client = this.getGoogleOauth2Client();
		oauth2Client.setCredentials({
			refresh_token: refreshToken,
			access_token: accessToken,
		});

		const gmail = google.gmail({ version: "v1", auth: oauth2Client });
		const profile = await gmail.users.getProfile({ userId: "me" });
		return profile.data.emailAddress;
	}

	private getGoogleOauth2Client() {
		return new google.auth.OAuth2(
			this.googleClientId,
			this.googleClientSecret,
			this.googleRedirectUri,
		);
	}

	public async getAuthorizationUrl(state?: string) {
		const oauth2Client = this.getGoogleOauth2Client();

		const authUrl = oauth2Client.generateAuthUrl({
			access_type: "offline",
			prompt: "consent",
			scope: ["https://www.googleapis.com/auth/gmail.readonly"],
			...(state ? { state } : {}),
		});

		return authUrl;
	}

	public async refreshTokens(refreshToken: string) {
		const oauth2Client = this.getGoogleOauth2Client();
		oauth2Client.setCredentials({
			refresh_token: refreshToken,
		});

		const result = await oauth2Client.refreshAccessToken();

		return {
			accessToken: result.credentials.access_token,
			refreshToken: result.credentials.refresh_token ?? refreshToken,
		};
	}

	public async codeToTokens(code: string) {
		const oauth2Client = this.getGoogleOauth2Client();
		const { tokens } = await oauth2Client.getToken(code);
		if (!tokens.access_token) {
			throw new Error("No access token");
		}
		if (!tokens.refresh_token) {
			throw new Error("No refresh token");
		}

		return {
			accessToken: tokens.access_token,
			refreshToken: tokens.refresh_token,
		};
	}

	public async getAuthorization(cachedUserTokenPath: string) {
		return new Promise<{ refreshToken: string; accessToken: string }>(
			(resolve) => {
				try {
					const tokens = JSON.parse(
						fs.readFileSync(cachedUserTokenPath, "utf-8"),
					);
					if (!tokens.accessToken) {
						throw new Error("No access token");
					}
					if (!tokens.refreshToken) {
						throw new Error("No refresh token");
					}
					resolve(tokens);
					return;
				} catch {}

				const server = http.createServer(
					wrapHandleOauthCallback({
						pathname: "/oauth2callback",
						staticHtmlAnswer: "You can now close this tab",
						codeToTokens: this.codeToTokens,
						callback: resolve,
					}),
				);
				server.listen(3000, "127.0.0.1", async () => {
					console.log(
						"Oauth callback server running at http://127.0.0.1:3000}/",
					);
					const authUrl = await this.getAuthorizationUrl();
					console.log(
						`Please open the following URL in your browser: ${authUrl}`,
					);
				});
			},
		);
	}
}
