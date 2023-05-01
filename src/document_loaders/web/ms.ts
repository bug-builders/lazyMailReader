import { LazyMailReaderMetadata } from "../../vectorstores/lazyMailReader.js";
import { emlToDocuments } from "./utils/emlToDocuments.js";
import { msListEmails } from "./utils/msListEmail.js";
import { wrapHandleOauthCallback } from "./utils/wrapHandleOauthCallback.js";
import msal, { ConfidentialClientApplication } from "@azure/msal-node";
import { Client, GraphError } from "@microsoft/microsoft-graph-client";
import fs from "fs";
import http from "http";
import { Document } from "langchain/document";
import { BaseDocumentLoader } from "langchain/document_loaders/base";

const MS_SCOPES = Object.freeze([
	"Mail.Read",
	"offline_access",
	"email",
	"User.Read",
]);

export interface MSLoaderParams {
	msClientId: string;
	msClientSecret: string;
	msRedirectUrl: string;
}

export class MSLoader extends BaseDocumentLoader implements MSLoaderParams {
	public msClientId: string;
	public msClientSecret: string;
	public msRedirectUrl: string;

	constructor({ msClientId, msClientSecret, msRedirectUrl }: MSLoaderParams) {
		super();
		this.msClientId = msClientId;
		this.msClientSecret = msClientSecret;
		this.msRedirectUrl = msRedirectUrl;
	}

	public async load(options?: {
		tokens: { accessToken: string; refreshToken: string };
		emlPath: string;
		userId: string;
		progressCallback?: ({
			index,
			total,
		}: { index: number; total: number }) => Promise<void>;
	}): Promise<Document<LazyMailReaderMetadata>[]> {
		if (!options?.userId || !options?.tokens || !options?.emlPath) {
			throw new Error("Missing options");
		}

		const client = Client.init({
			authProvider: (done) => {
				done(null, options.tokens.accessToken);
			},
		});

		const emlList = await msListEmails({
			progressCallback: options?.progressCallback,
			msClient: client,
			emlPath: options.emlPath,
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
		const client = Client.init({
			authProvider: (done) => {
				done(null, accessToken);
			},
		});

		const user = await client.api("/me").version("v1.0").select("mail").get();
		return user.mail ?? user.userPrincipalName;
	}

	private getMSOauth2Client() {
		return new msal.ConfidentialClientApplication({
			auth: {
				authority: "https://login.microsoftonline.com/common",
				clientId: this.msClientId,
				clientSecret: this.msClientSecret,
			},
		});
	}

	public async getAuthorizationUrl(state?: string) {
		const oauth2Client = this.getMSOauth2Client();

		const authUrl = await oauth2Client.getAuthCodeUrl({
			redirectUri: this.msRedirectUrl,
			scopes: [...MS_SCOPES],
			...(state ? { state } : {}),
		});

		return authUrl;
	}

	private retrieveRefreshTokenFromCache(
		oauth2Client: ConfidentialClientApplication,
	): string | undefined {
		try {
			const tokenCache = oauth2Client.getTokenCache().serialize();
			const refreshTokenObject = JSON.parse(tokenCache).RefreshToken;
			const refreshToken =
				refreshTokenObject[Object.keys(refreshTokenObject)[0]].secret;
			return refreshToken;
		} catch {
			return undefined;
		}
	}

	public async refreshTokens(refreshToken: string) {
		const oauth2Client = this.getMSOauth2Client();
		const result = await oauth2Client.acquireTokenByRefreshToken({
			refreshToken,
			scopes: [...MS_SCOPES],
		});

		const newRefreshToken = this.retrieveRefreshTokenFromCache(oauth2Client);

		return {
			accessToken: result?.accessToken,
			refreshToken: newRefreshToken ?? refreshToken,
		};
	}

	public async codeToTokens(code: string) {
		const oauth2Client = this.getMSOauth2Client();
		const result = await oauth2Client.acquireTokenByCode({
			code,
			redirectUri: this.msRedirectUrl,
			scopes: [...MS_SCOPES],
		});

		const refreshToken = this.retrieveRefreshTokenFromCache(oauth2Client);
		if (!refreshToken) {
			throw new Error("no refreshToken");
		}

		return {
			accessToken: result.accessToken,
			refreshToken,
		};
	}

	private async getAuthorization(cachedUserTokenPath: string) {
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
						pathname: "/ms-oauth2callback",
						staticHtmlAnswer: "You can now close this tab",
						codeToTokens: this.codeToTokens,
						callback: resolve,
					}),
				);
				server.listen(3000, "127.0.0.1", async () => {
					console.log(
						"Oauth callback server running at http://127.0.0.1:3000/",
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
