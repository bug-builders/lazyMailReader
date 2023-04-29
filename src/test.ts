import { metadataDates } from "./prompts/metadata-dates.js";

export const run = async (request: string) => {
	const dates = await metadataDates(request);

	console.log(dates);
};

await run(process.argv[2]);
