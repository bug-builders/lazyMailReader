import { Embeddings, EmbeddingsParams } from "langchain/embeddings/base";
import { join } from "path";

function buildUrl(
	endpoint: string,
	path: string,
	searchParams: Record<string, string | number> = {},
) {
	const url = new URL(endpoint);
	url.pathname = join(url.pathname, path);
	Object.entries(searchParams).forEach(([key, value]) =>
		url.searchParams.append(key, value.toString()),
	);
	return url.toString();
}

const SENTENCE_TRANSFORMERS_URL = "http://127.0.0.1:5000/";

export class SentenceTransformersEmbeddings extends Embeddings {
	constructor(params?: EmbeddingsParams) {
		super(params ?? {});
	}

	async embedDocuments(documents: string[]): Promise<number[][]> {
		const res = await fetch(buildUrl(SENTENCE_TRANSFORMERS_URL, "/embed"), {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ sentences: documents }),
		});

		return await res.json();
	}

	async embedQuery(query: string): Promise<number[]> {
		const [result] = await this.embedDocuments([query]);
		return result;
	}
}
