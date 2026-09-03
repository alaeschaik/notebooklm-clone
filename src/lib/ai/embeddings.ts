import OpenAI from "openai";

import { EMBEDDING_DIMENSIONS } from "@/lib/db/schema";

export const EMBEDDING_MODEL = "text-embedding-3-small";

/** Inputs per request. Keeps payloads well inside the API's limits. */
const BATCH_SIZE = 96;

/** Roughly the model's 8191-token input ceiling, in characters. */
const MAX_INPUT_CHARS = 30_000;

let client: OpenAI | undefined;

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY is not set. It is required to embed sources for retrieval.",
      );
    }
    client = new OpenAI({ apiKey });
  }
  return client;
}

/**
 * Embeds texts in order. The returned array lines up index-for-index with the
 * input, which the ingestion pipeline relies on to pair vectors with chunks.
 */
export async function embedAll(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const openai = getClient();
  const vectors: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts
      .slice(i, i + BATCH_SIZE)
      // The API rejects empty strings, and an over-long chunk would fail the
      // whole batch — truncating only affects the vector, never the stored text.
      .map((text) => (text.trim() || "empty").slice(0, MAX_INPUT_CHARS));

    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
      dimensions: EMBEDDING_DIMENSIONS,
    });

    // The API documents `index` rather than guaranteeing response order.
    const ordered = [...response.data].sort((a, b) => a.index - b.index);
    vectors.push(...ordered.map((item) => item.embedding));
  }

  return vectors;
}

export async function embedOne(text: string): Promise<number[]> {
  const [vector] = await embedAll([text]);
  if (!vector) throw new Error("Embedding request returned no vector");
  return vector;
}
