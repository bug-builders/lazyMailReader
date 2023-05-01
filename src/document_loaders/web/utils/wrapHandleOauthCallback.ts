import http from "http";

function notFound(res: http.ServerResponse<http.IncomingMessage>) {
	res.statusCode = 404;
	res.setHeader("Content-Type", "text/plain");
	res.end("Not found.\n");
}

export function wrapHandleOauthCallback<T>({
	services,
	pathname,
	staticHtmlAnswer,
	codeToTokens,
	callback,
}: {
	services?: T;
	pathname: string;
	staticHtmlAnswer: string;
	codeToTokens: (
		code: string,
	) => Promise<{ accessToken: string; refreshToken: string }>;
	callback: (
		tokens: { accessToken: string; refreshToken: string },
		state: null | string,
		services?: T,
	) => void;
}) {
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

		if (url.pathname !== pathname) {
			return notFound(res);
		}

		const code = url.searchParams.get("code");
		if (!code) {
			return notFound(res);
		}

		try {
			const tokens = await codeToTokens(code);
			const state = url.searchParams.get("state");
			res.statusCode = 200;
			res.setHeader("Content-Type", "text/html");
			res.end(staticHtmlAnswer);

			callback(tokens, state, services);
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
