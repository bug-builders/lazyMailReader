import { Services } from "./setupServices.js";
import { CustomRoute } from "@slack/bolt";
import { readFileSync } from "fs";
import { join } from "path";

export function generateOnePageRouteHandlers(
	services: Services,
): CustomRoute[] {
	return [
		{
			method: "GET",
			path: "/close.html",
			handler: (req, res) => {
				res.statusCode = 200;
				res.setHeader("Content-Type", "text/html");
				res.end(
					readFileSync(join(services.config.ONE_PAGE_DIRECTORY, "/close.html")),
				);
			},
		},
		{
			method: "GET",
			path: "/",
			handler: (req, res) => {
				res.statusCode = 200;
				res.setHeader("Content-Type", "text/html");
				res.end(
					readFileSync(join(services.config.ONE_PAGE_DIRECTORY, "/index.html")),
				);
			},
		},
		{
			method: "GET",
			path: "/index.html",
			handler: (req, res) => {
				res.statusCode = 200;
				res.setHeader("Content-Type", "text/html");
				res.end(
					readFileSync(join(services.config.ONE_PAGE_DIRECTORY, "/index.html")),
				);
			},
		},
		{
			method: "GET",
			path: "/bot_image.png",
			handler: (req, res) => {
				res.statusCode = 200;
				res.setHeader("Content-Type", "image/png");
				res.end(
					readFileSync(
						join(services.config.ONE_PAGE_DIRECTORY, "/bot_image.png"),
					),
				);
			},
		},
		{
			method: "GET",
			path: "/privacy_policy.html",
			handler: (req, res) => {
				res.statusCode = 200;
				res.setHeader("Content-Type", "text/html");
				res.end(
					readFileSync(
						join(services.config.ONE_PAGE_DIRECTORY, "/privacy_policy.html"),
					),
				);
			},
		},
		{
			method: "GET",
			path: "/terms_of_service.html",
			handler: (req, res) => {
				res.statusCode = 200;
				res.setHeader("Content-Type", "text/html");
				res.end(
					readFileSync(
						join(services.config.ONE_PAGE_DIRECTORY, "/terms_of_service.html"),
					),
				);
			},
		},
	];
}
