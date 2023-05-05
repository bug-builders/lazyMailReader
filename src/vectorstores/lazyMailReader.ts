import { Client } from "@elastic/elasticsearch";
import {
	IndicesIndexSettings,
	MappingProperty,
} from "@elastic/elasticsearch/lib/api/types.js";
import { Document } from "langchain/document";
import { Embeddings } from "langchain/embeddings/base";
import { VectorStore } from "langchain/vectorstores/base";

const INDEX = "lazy_mail_reader";
const settings: IndicesIndexSettings = {
	analysis: {
		tokenizer: {
			ngram_tokenizer: {
				type: "ngram",
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				//@ts-ignore
				min_gram: "2",
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				//@ts-ignore
				max_gram: "20",
				token_chars: ["letter", "digit", "punctuation", "symbol"],
			},
		},
		analyzer: {
			ngram_analyzer: {
				filter: ["lowercase"],
				type: "custom",
				tokenizer: "ngram_tokenizer",
			},
		},
	},
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	//@ts-ignore
	max_ngram_diff: "30",
};
const mapping: Record<string, MappingProperty> = {
	userId: {
		type: "keyword",
	},
	date: {
		type: "date",
	},
	threadId: {
		type: "keyword",
	},
	id: {
		type: "keyword",
	},
	messageId: {
		type: "keyword",
	},
	ccAddress: {
		type: "keyword",
		fields: {
			search: {
				type: "text",
				analyzer: "ngram_analyzer",
				search_analyzer: "keyword",
			},
		},
	},
	ccName: {
		type: "keyword",
		fields: {
			search: {
				type: "text",
				analyzer: "ngram_analyzer",
				search_analyzer: "keyword",
			},
		},
	},
	toAddress: {
		type: "keyword",
		fields: {
			search: {
				type: "text",
				analyzer: "ngram_analyzer",
				search_analyzer: "keyword",
			},
		},
	},
	toName: {
		type: "keyword",
		fields: {
			search: {
				type: "text",
				analyzer: "ngram_analyzer",
				search_analyzer: "keyword",
			},
		},
	},
	fromAddress: {
		type: "keyword",
		fields: {
			search: {
				type: "text",
				analyzer: "ngram_analyzer",
				search_analyzer: "keyword",
			},
		},
	},
	fromName: {
		type: "keyword",
		fields: {
			search: {
				type: "text",
				analyzer: "ngram_analyzer",
				search_analyzer: "keyword",
			},
		},
	},
	emailHtml: {
		type: "text",
	},
	emailText: {
		type: "text",
	},
	subject: {
		type: "text",
		fields: {
			search: {
				type: "text",
				analyzer: "ngram_analyzer",
				search_analyzer: "keyword",
			},
		},
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
	userId: string;
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
	messageId: string;
	subject: string;
};

type CrossEncoder = (
	query: string,
	sentences: string[],
	multiLang: boolean,
) => Promise<number[]>;
export class LazyMailReaderVectorStore extends VectorStore {
	private readonly client: Client;
	private readonly crossEncode?: CrossEncoder;
	private readonly multiLang: boolean;

	constructor(
		embeddings: Embeddings & {
			crossEncode?: CrossEncoder;
		},
		args: {
			client: Client;
			multiLang?: boolean;
		},
	) {
		super(embeddings, args);
		this.client = args.client;
		this.crossEncode = embeddings.crossEncode;
		this.multiLang = args.multiLang ?? false;
	}

	async addDocuments(
		documents: Document<LazyMailReaderMetadata>[],
		options?: { userId: string },
	): Promise<void> {
		await this.ensureIndexExists();
		if (!options?.userId) {
			throw new Error("Missing userId");
		}
		const newDocuments =
			await LazyMailReaderVectorStore.filterExistingDocuments({
				client: this.client,
				documents,
				userId: options?.userId,
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
			settings,
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

	async countDocuments({ userId }: { userId: string }) {
		await this.ensureIndexExists();
		const result = await this.client.count({
			index: INDEX,
			query: {
				bool: {
					filter: {
						term: {
							userId: {
								value: userId,
							},
						},
					},
				},
			},
		});

		return result.count;
	}

	async deleteDocuments({ userId }: { userId: string }) {
		await this.ensureIndexExists();
		await this.client.deleteByQuery({
			index: INDEX,
			query: {
				bool: {
					filter: {
						term: {
							userId: {
								value: userId,
							},
						},
					},
				},
			},
		});
	}

	async similaritySearchVectorWithScore(
		query: number[],
		k: number,
		filter: {
			userId: string;
			query: string;
			dates: { startingDate: string | null; endingDate: string | null };
			subject: string;
			senders: string[] | null;
			lang: "en" | "fr";
		} & Record<string, string>,
	): Promise<[Document<LazyMailReaderMetadata>, number][]> {
		if (!filter.userId) {
			throw new Error("Missing userId");
		}

		const esQuery = {
			script_score: {
				query: {
					bool: {
						filter: [
							{
								term: {
									userId: {
										value: filter.userId,
									},
								},
							},
							...(filter.dates.endingDate || filter.dates.startingDate
								? [
										{
											range: {
												date: {
													...(filter.dates.startingDate
														? { gte: filter.dates.startingDate }
														: {}),
													...(filter.dates.endingDate
														? { lte: filter.dates.endingDate }
														: {}),
												},
											},
										},
								  ]
								: []),
						],
						should: [
							...(filter.query
								? [
										{
											match: {
												emailText: {
													query: filter.query,
													fuzziness: "AUTO",
												},
											},
										},
								  ]
								: []),
							...(filter.subject
								? [
										{
											match: {
												subject: {
													boost: 2,
													query: filter.subject,
													fuzziness: "AUTO",
												},
											},
										},
								  ]
								: []),
							...(filter.senders
								? filter.senders.map((sender) => ({
										multi_match: {
											boost: 3,
											query: sender.toLowerCase(),
											fields: [
												"ccAddress.search",
												"ccName.search",
												"fromAddress.search^2",
												"fromName.search^2",
											],
											fuzziness: "AUTO",
										},
								  }))
								: []),
						],
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
		};

		const { hits } = await this.client.search<LazyMailReaderMetadata>({
			index: INDEX,
			size: k,
			_source: {
				includes: [
					"userId",
					"emailText",
					"date",
					"threadId",
					"id",
					"subject",
					"fromAddress",
					"fromName",
					"messageId",
				],
			},
			query: esQuery,
		});

		if (!this.crossEncode || !filter?.query) {
			return hits.hits.map((hit) => [
				new Document<LazyMailReaderMetadata>({
					pageContent: hit._source?.emailText ?? "",
					metadata: hit._source,
				}),
				hit._score ?? 0,
			]);
		}

		const sentences = hits.hits.map((hit) => hit._source?.emailText ?? "");
		const scores = await this.crossEncode(
			filter.query,
			sentences,
			filter.lang !== "en",
		);
		return hits.hits.map((hit, i) => [
			new Document<LazyMailReaderMetadata>({
				pageContent: hit._source?.emailText ?? "",
				metadata: hit._source,
			}),
			scores.at(i) ?? 0,
		]);
	}

	static fromTexts(
		texts: string[],
		metadatas: object[] | object,
		embeddings: Embeddings,
		args: { client: Client; userId: string },
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
		userId,
	}: {
		client: Client;
		documents: Document<LazyMailReaderMetadata>[];
		userId: string;
	}) {
		const idList = documents.map((document) => document.metadata.id);
		const { hits } = await client.search<{ id: string }>({
			index: INDEX,
			size: documents.length + 1,
			_source: {
				includes: ["id"],
			},
			query: {
				bool: {
					filter: [
						{
							terms: {
								id: idList,
							},
						},
						{
							term: {
								userId: {
									value: userId,
								},
							},
						},
					],
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
		args: { client: Client; userId: string },
	): Promise<LazyMailReaderVectorStore> {
		const newDocuments = await this.filterExistingDocuments({
			client: args.client,
			documents: docs,
			userId: args.userId,
		});

		const store = new LazyMailReaderVectorStore(embeddings, args);
		await store.addDocuments(newDocuments);
		return store;
	}
}
