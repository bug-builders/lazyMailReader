import { LazyMailReaderMetadata } from "../../vectorstores/lazyMailReader.js";
import { emlToDocuments } from "./gmail_utils/emlToDocuments.js";
import { wrapHandleOauthCallback } from "./gmail_utils/handOauthCallback.js";
import { listEmails } from "./gmail_utils/listEmails.js";
import fs from "fs";
import { google } from "googleapis";
import http from "http";
import { Document } from "langchain/document";
import { BaseDocumentLoader } from "langchain/document_loaders/base";

export interface GmailLoaderParams {
	cachedUserTokenPath?: string;
	accessToken?: string;
	refreshToken?: string;
	oauthCallbackPort?: number;
	googleEmlPath?: string;
	googleClientId: string;
	googleClientSecret: string;
}

export class GmailLoader extends BaseDocumentLoader implements GmailLoaderParams {
	public cachedUserTokenPath: string;
	public accessToken?: string;
	public refreshToken?: string;
	public port: number;
	public googleClientId: string;
	public googleClientSecret: string;
	public googleEmlPath?: string;

	constructor({
		cachedUserTokenPath,
		accessToken,
		refreshToken,
		oauthCallbackPort,
		googleClientId,
		googleClientSecret,
		googleEmlPath,
	}: GmailLoaderParams) {
		super();
		this.cachedUserTokenPath =
			cachedUserTokenPath ?? "/tmp/lazy-mail-reader-credentials.json";
		this.accessToken = accessToken;
		this.refreshToken = refreshToken;
		this.port = oauthCallbackPort ?? 3000;
		this.googleClientId = googleClientId;
		this.googleClientSecret = googleClientSecret;
		this.googleEmlPath = googleEmlPath;
	}

	public async load(options?: {
		userId: string;
		progressCallback?: ({
			index,
			total,
		}: { index: number; total: number }) => Promise<void>;
	}): Promise<Document<LazyMailReaderMetadata>[]> {
		if (!options?.userId) {
			throw new Error("Missing userId");
		}
		if (!this.accessToken || !this.refreshToken) {
			const { accessToken, refreshToken } = await this.getAuthorization();
			this.accessToken = accessToken;
			this.refreshToken = refreshToken;
		}

		const emlList = await listEmails({
			progressCallback: options?.progressCallback,
			oauth2Client: this.getGoogleOauth2Client(),
			accessToken: this.accessToken,
			refreshToken: this.refreshToken,
			googleEmlPath: this.googleEmlPath,
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

	public async getUserEmailAddress() {
		if (!this.accessToken || !this.refreshToken) {
			const { accessToken, refreshToken } = await this.getAuthorization();
			this.accessToken = accessToken;
			this.refreshToken = refreshToken;
		}

		const oauth2Client = this.getGoogleOauth2Client();
		oauth2Client.setCredentials({
			refresh_token: this.refreshToken,
			access_token: this.accessToken,
		});

		const gmail = google.gmail({ version: "v1", auth: oauth2Client });
		const profile = await gmail.users.getProfile({ userId: "me" });
		return profile.data.emailAddress;
	}

	private getGoogleOauth2Client() {
		const REDIRECT_URI = `http://localhost:${this.port}/oauth2callback`;

		return new google.auth.OAuth2(
			this.googleClientId,
			this.googleClientSecret,
			REDIRECT_URI,
		);
	}

	private async getAuthorizationUrl() {
		const oauth2Client = this.getGoogleOauth2Client();

		const authUrl = oauth2Client.generateAuthUrl({
			access_type: "offline",
			scope: ["https://www.googleapis.com/auth/gmail.readonly"],
		});

		return authUrl;
	}

	private async getAuthorization() {
		return new Promise<{ refreshToken: string; accessToken: string }>(
			(resolve) => {
				try {
					const tokens = JSON.parse(
						fs.readFileSync(this.cachedUserTokenPath, "utf-8"),
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
					wrapHandleOauthCallback(this.getGoogleOauth2Client(), resolve),
				);
				server.listen(this.port, "127.0.0.1", async () => {
					console.log(
						`Oauth callback server running at http://127.0.0.1:${this.port}/`,
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
