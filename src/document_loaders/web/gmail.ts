import { LazyMailReaderMetadata } from "../../vectorstores/lazyMailReader.js";
import { emlToDocument } from "./gmail_utils/emlToDocument.js";
import { listEmails } from "./gmail_utils/listEmails.js";
import fs from "fs";
import { google } from "googleapis";
import http from "http";
import { Document } from "langchain/document";
import { BaseDocumentLoader } from "langchain/document_loaders/base";

const BATCH_SIZE = 10;

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

	public async load(): Promise<Document<LazyMailReaderMetadata>[]> {
		if (!this.accessToken || !this.refreshToken) {
			const { accessToken, refreshToken } = await this.getAuthorization();
			this.accessToken = accessToken;
			this.refreshToken = refreshToken;
		}

		const emlList = await listEmails({
			oauth2Client: this.getGoogleOauth2Client(),
			accessToken: this.accessToken,
			refreshToken: this.refreshToken,
			googleEmlPath: this.googleEmlPath,
		});

		const documents: Awaited<ReturnType<typeof emlToDocument>>[] = [];
		for (const eml of emlList) {
			const document = await emlToDocument(eml);
			documents.push(document);
		}

		return documents;
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

	private async notFound(res: http.ServerResponse<http.IncomingMessage>) {
		res.statusCode = 404;
		res.setHeader("Content-Type", "text/plain");
		res.end("Not found.\n");
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

				const server = http.createServer(async (req, res) => {
					if (!req.url || req.method !== "GET") {
						return this.notFound(res);
					}
					const url = new URL(`http://127.0.0.1:${this.port}${req.url}`);
					console.log(url);

					if (url.pathname !== "/oauth2callback") {
						return this.notFound(res);
					}

					const code = url.searchParams.get("code");
					if (!code) {
						return this.notFound(res);
					}

					const oauth2Client = this.getGoogleOauth2Client();

					try {
						const { tokens } = await oauth2Client.getToken(code);
						if (!tokens.access_token) {
							throw new Error("No access token");
						}
						if (!tokens.refresh_token) {
							throw new Error("No refresh token");
						}

						const cacheTokens = {
							accessToken: tokens.access_token,
							refreshToken: tokens.refresh_token,
						};
						fs.writeFileSync(
							this.cachedUserTokenPath,
							JSON.stringify(cacheTokens, null, 2),
						);
						res.statusCode = 200;
						res.setHeader("Content-Type", "text/plain");
						res.end("Tokens received. You can close this window.\n");
						server.close();
						resolve(cacheTokens);
					} catch (error) {
						console.error("Error getting tokens:", error);
						res.statusCode = 500;
						res.setHeader("Content-Type", "text/plain");
						res.end(
							`Error getting tokens: ${error}. Check the console for more information.\n`,
						);
					}
				});

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
