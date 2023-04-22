import { Client } from "@elastic/elasticsearch";
import { MappingProperty } from "@elastic/elasticsearch/lib/api/types.js";
import { Document } from "langchain/document";
import { Embeddings } from "langchain/embeddings/base";
import { VectorStore } from "langchain/vectorstores/base";

const INDEX = "lazy_mail_reader";
const mapping: Record<string, MappingProperty> = {
	date: {
		type: "date",
	},
	threadId: {
		type: "keyword",
	},
	id: {
		type: "keyword",
	},
	ccAddress: {
		type: "keyword",
	},
	ccName: {
		type: "keyword",
	},
	toAddress: {
		type: "keyword",
	},
	toName: {
		type: "keyword",
	},
	fromAddress: {
		type: "keyword",
	},
	fromName: {
		type: "keyword",
	},
	emailHtml: {
		type: "text",
	},
	emailText: {
		type: "text",
	},
	subject: {
		type: "text",
	},
	isHtml: {
		type: "boolean",
	},
	embedding: {
		type: "dense_vector",
		dims: 768,
		index: true,
		similarity: "cosine",
	},
};

export type LazyMailReaderMetadata = {
	isHtml: boolean;
	date: Date;
	threadId: string;
	id: string;
	ccAddress?: string[];
	ccName?: string[];
	toAddress?: string[];
	toName?: string[];
	fromAddress?: string[];
	fromName?: string[];
	emailText: string;
	emailHtml: string;
	subject: string;
};

export class LazyMailReaderVectorStore extends VectorStore {
	private readonly client: Client;

	constructor(embeddings: Embeddings, args: { client: Client }) {
		super(embeddings, args);
		this.client = args.client;
	}

	async addDocuments(
		documents: Document<LazyMailReaderMetadata>[],
	): Promise<void> {
		await this.ensureIndexExists();
		const newDocuments =
			await LazyMailReaderVectorStore.filterExistingDocuments({
				client: this.client,
				documents,
			});
		const texts = newDocuments.map(({ pageContent }) => pageContent);
		return this.addVectors(
			await this.embeddings.embedDocuments(texts),
			newDocuments,
		);
	}

	async ensureIndexExists() {
		const exists = await this.client.indices.exists({
			index: INDEX,
		});

		if (exists) {
			return;
		}

		await this.client.indices.create({
			mappings: {
				properties: mapping,
			},
			index: INDEX,
		});
	}

	async addVectors(
		vectors: number[][],
		documents: Document<LazyMailReaderMetadata>[],
	): Promise<void> {
		await this.ensureIndexExists();
		const operations = vectors.flatMap((embedding, idx) => [
			{
				index: {
					_index: INDEX,
					_id: documents[idx].metadata.id,
				},
			},
			{
				...documents[idx].metadata,
				embedding,
			},
		]);
		if (operations.length === 0) {
			return;
		}
		await this.client.bulk({ refresh: true, index: INDEX, operations });
	}

	async similaritySearchVectorWithScore(
		query: number[],
		k: number,
		filter?: Record<string, string> | undefined,
	): Promise<[Document<LazyMailReaderMetadata>, number][]> {
		const { hits } = await this.client.search<LazyMailReaderMetadata>({
			index: INDEX,
			size: k,
			_source: {
				includes: ["emailText"],
			},
			query: {
				script_score: {
					query: {
						bool: {
							...(filter?.query
								? {
										should: [
											{
												match: {
													emailText: {
														query: filter.query,
													},
												},
											},
											{
												match: {
													subject: {
														query: filter.query,
													},
												},
											},
										],
								  }
								: {}),
							filter: {
								term: {
									isHtml: {
										value: false,
									},
								},
							},
						},
					},
					script: {
						source: [
							"(_score + 1.0)",
							`(cosineSimilarity(params.queryVector, 'embedding') + 1.0)`,
							"(decayDateExp(params.origin, params.scale, params.offset, params.decay, doc['date'].value) + 1.0)",
						].join(" * "),
						params: {
							queryVector: query,
							origin: new Date().toISOString(),
							scale: "30d",
							decay: 0.5,
							offset: "0",
						},
					},
				},
			},
		});

		return hits.hits.map((hit) => [
			new Document<LazyMailReaderMetadata>({
				pageContent: hit._source?.emailText ?? "",
				metadata: hit._source,
			}),
			hit._score ?? 0,
		]);
	}

	static fromTexts(
		texts: string[],
		metadatas: object[] | object,
		embeddings: Embeddings,
		args: { client: Client },
	): Promise<LazyMailReaderVectorStore> {
		const documents = texts.map((text, idx) => {
			const metadata = Array.isArray(metadatas) ? metadatas[idx] : metadatas;
			return new Document({ pageContent: text, metadata });
		});

		return LazyMailReaderVectorStore.fromDocuments(documents, embeddings, args);
	}

	static async filterExistingDocuments({
		client,
		documents,
	}: { client: Client; documents: Document<LazyMailReaderMetadata>[] }) {
		const idList = documents.map((document) => document.metadata.id);
		const { hits } = await client.search<{ id: string }>({
			index: INDEX,
			size: documents.length + 1,
			_source: {
				includes: ["id"],
			},
			query: {
				terms: {
					id: idList,
				},
			},
		});

		const existingIdList: string[] = [];

		for (const hit of hits.hits) {
			const id = hit._source?.id;
			if (id && idList.includes(id)) {
				existingIdList.push(id);
			}
		}

		const newDocuments = documents.filter(
			(document) => !existingIdList.includes(document.metadata.id),
		);

		return newDocuments;
	}

	static async fromDocuments(
		docs: Document<LazyMailReaderMetadata>[],
		embeddings: Embeddings,
		args: { client: Client },
	): Promise<LazyMailReaderVectorStore> {
		const newDocuments = await this.filterExistingDocuments({
			client: args.client,
			documents: docs,
		});

		const store = new LazyMailReaderVectorStore(embeddings, args);
		await store.addDocuments(newDocuments);
		return store;
	}

	static async fromExistingIndex(
		embeddings: Embeddings,
		args: { client: Client },
	): Promise<LazyMailReaderVectorStore> {
		const store = new LazyMailReaderVectorStore(embeddings, args);
		await store.client.cat.indices({ index: INDEX });
		return store;
	}

	private buildMetadataTerms(
		filter?: object,
	): { term: Record<string, unknown> }[] {
		if (filter == null) return [];
		const result = [];
		for (const [key, value] of Object.entries(filter)) {
			result.push({ term: { [`metadata.${key}`]: value } });
		}
		return result;
	}

	async doesIndexExist(): Promise<boolean> {
		await this.client.cat.indices({ index: INDEX });
		return true;
	}

	async deleteIfExists(): Promise<void> {
		await this.client.indices.delete({
			index: INDEX,
			ignore_unavailable: true,
		});
	}
}
