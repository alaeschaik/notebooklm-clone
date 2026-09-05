import OpenAI from "openai";

import { EMBEDDING_DIMENSIONS } from "@/lib/db/schema";

export const EMBEDDING_MODEL = "text-embedding-3-small";

/** Inputs per request. Keeps payloads well inside the API's limits. */
const BATCH_SIZE = 96;

/** Roughly the model's 8191-token input ceiling, in characters. */
const MAX_INPUT_CHARS = 30_000;

let client: OpenAI | undefined;

/**
 * Embeddings are an enhancement, not a requirement. Without a key the semantic
 * half of hybrid retrieval is simply absent and ranking falls back to full-text
 * alone, which still answers most questions — and notebooks small enough to be
 * sent in full never consult the index at all.
 *
 * Failing hard instead would make an optional provider a hard dependency for
 * running the project.
 */
export function embeddingsEnabled(): boolean {
  const key = process.env.OPENAI_API_KEY?.trim();
  // The template in .env.example ships a placeholder; treat it as absent so a
  // half-configured checkout degrades instead of erroring on every ingest.
  return Boolean(key) && key !== "sk-..." && !key!.endsWith("...");
}

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

/**
 * Embeds texts in order. The returned array lines up index-for-index with the
 * input, which the ingestion pipeline relies on to pair vectors with chunks.
 */
export async function embedAll(texts: string[]): Promise<(number[] | null)[]> {
  if (texts.length === 0) return [];

  if (!embeddingsEnabled()) {
    console.warn(
      "[embeddings] OPENAI_API_KEY is not set — storing chunks without vectors. Retrieval will use full-text search only.",
    );
    return texts.map(() => null);
  }

  const openai = getClient();
  const vectors: (number[] | null)[] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts
      .slice(i, i + BATCH_SIZE)
      // The API rejects empty strings, and an over-long chunk would fail the
      // whole batch — truncating only affects the vector, never the stored text.
      .map((text) => (text.trim() || "empty").slice(0, MAX_INPUT_CHARS));

    try {
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: batch,
        dimensions: EMBEDDING_DIMENSIONS,
      });

      // The API documents `index` rather than guaranteeing response order.
      const ordered = [...response.data].sort((a, b) => a.index - b.index);
      vectors.push(...ordered.map((item) => item.embedding));
    } catch (error) {
      // A source that ingests without vectors is still readable, citable and
      // answerable; a source that fails to ingest is useless. So an embedding
      // outage degrades retrieval instead of losing the document — loudly,
      // because in production it does mean a real loss of ranking quality.
      console.error(
        "[embeddings] request failed — storing this batch without vectors; retrieval falls back to full-text",
        error,
      );
      vectors.push(...batch.map(() => null));
    }
  }

  return vectors;
}

/** Returns `null` when embeddings are unavailable, so callers can skip the
 * semantic arm rather than fail. */
export async function embedOne(text: string): Promise<number[] | null> {
  const [vector] = await embedAll([text]);
  return vector ?? null;
}
