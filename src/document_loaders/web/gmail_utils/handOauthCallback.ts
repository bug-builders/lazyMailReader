import { readFileSync } from "fs";
import * as google from "googleapis";
import http from "http";
import { join } from "path";

function notFound(res: http.ServerResponse<http.IncomingMessage>) {
	res.statusCode = 404;
	res.setHeader("Content-Type", "text/plain");
	res.end("Not found.\n");
}

export function wrapHandleOauthCallback(
	staticHtmlAnswer: string,
	oauth2Client: google.Auth.OAuth2Client,
	callback: (
		tokens: { accessToken: string; refreshToken: string },
		state: null | string,
	) => void,
) {
	return async function handleOauthCallback(
		req: http.IncomingMessage,
		res: http.ServerResponse<http.IncomingMessage> & {
			req: http.IncomingMessage;
		},
	) {
		if (!req.url || req.method !== "GET") {
			return notFound(res);
		}
		const url = new URL(`http://127.0.0.1${req.url}`);

		if (url.pathname !== "/oauth2callback") {
			return notFound(res);
		}

		const code = url.searchParams.get("code");
		if (!code) {
			return notFound(res);
		}

		try {
			const { tokens } = await oauth2Client.getToken(code);
			const state = url.searchParams.get("state");
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

			res.statusCode = 200;
			res.setHeader("Content-Type", "text/html");
			res.end(staticHtmlAnswer);

			callback(cacheTokens, state);
		} catch (error) {
			console.error("Error getting tokens:", error);
			res.statusCode = 500;
			res.setHeader("Content-Type", "text/plain");
			res.end(
				`Error getting tokens: ${error}. Check the console for more information.\n`,
			);
		}
	};
}
