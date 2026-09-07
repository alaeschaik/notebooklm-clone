import { GoogleGenAI } from "@google/genai";

import { EMBEDDING_DIMENSIONS } from "@/lib/db/schema";

/**
 * Gemini rather than OpenAI, for two reasons: a Gemini key is already required
 * for the audio overview, so this removes a third provider from the setup; and
 * its embedding endpoint is available on the free tier, which means a reviewer
 * can clone the repo and get working retrieval without a paid account.
 *
 * `gemini-embedding-001` supports an explicit output dimensionality, and 1536
 * is what the `chunks.embedding` column is declared as.
 *
 * Changing this model — or the provider — invalidates every stored vector.
 * Embeddings from different models are not comparable, so a switch requires
 * re-ingesting existing sources, not just a redeploy.
 */
export const EMBEDDING_MODEL = "gemini-embedding-001";

/** Inputs per request, kept well inside the endpoint's batch limit. */
const BATCH_SIZE = 64;

/** Roughly the model's input ceiling, in characters. */
const MAX_INPUT_CHARS = 30_000;

let client: GoogleGenAI | undefined;

/**
 * Embeddings are an enhancement, not a requirement. Without a key the semantic
 * half of hybrid retrieval is simply absent and ranking falls back to full-text
 * alone — and notebooks small enough to be sent in full never consult the index
 * at all. Failing hard would make an optional provider a hard dependency.
 */
export function embeddingsEnabled(): boolean {
  const key = process.env.GEMINI_API_KEY?.trim();
  // The template in .env.example ships a placeholder; treat it as absent so a
  // half-configured checkout degrades instead of erroring on every ingest.
  return Boolean(key) && key !== "..." && !key!.endsWith("...");
}

function getClient(): GoogleGenAI {
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

/**
 * Gemini distinguishes the two sides of a retrieval pair. Embedding a question
 * as a document — or the reverse — measurably degrades matching, because a
 * question and the passage answering it are not paraphrases of one another.
 */
type TaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

async function embedBatch(
  texts: string[],
  taskType: TaskType,
): Promise<(number[] | null)[]> {
  const response = await getClient().models.embedContent({
    model: EMBEDDING_MODEL,
    contents: texts,
    config: { outputDimensionality: EMBEDDING_DIMENSIONS, taskType },
  });

  const embeddings = response.embeddings ?? [];
  return texts.map((_, index) => embeddings[index]?.values ?? null);
}

/**
 * Embeds texts in order. The returned array lines up index-for-index with the
 * input, which the ingestion pipeline relies on to pair vectors with chunks.
 */
export async function embedAll(
  texts: string[],
  taskType: TaskType = "RETRIEVAL_DOCUMENT",
): Promise<(number[] | null)[]> {
  if (texts.length === 0) return [];

  if (!embeddingsEnabled()) {
    console.warn(
      "[embeddings] GEMINI_API_KEY is not set — storing chunks without vectors. Retrieval will use full-text search only.",
    );
    return texts.map(() => null);
  }

  const vectors: (number[] | null)[] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts
      .slice(i, i + BATCH_SIZE)
      // Empty strings are rejected, and an over-long chunk would fail the whole
      // batch — truncating affects only the vector, never the stored text.
      .map((text) => (text.trim() || "empty").slice(0, MAX_INPUT_CHARS));

    try {
      vectors.push(...(await embedBatch(batch, taskType)));
    } catch (error) {
      // A source that ingests without vectors is still readable, citable and
      // answerable; a source that fails to ingest is useless. So an embedding
      // outage degrades retrieval instead of losing the document — loudly,
      // because it does mean a real loss of ranking quality.
      console.error(
        "[embeddings] request failed — storing this batch without vectors; retrieval falls back to full-text",
        error,
      );
      vectors.push(...batch.map(() => null));
    }
  }

  return vectors;
}

/** Embeds a search query. Returns `null` when embeddings are unavailable. */
export async function embedQuery(text: string): Promise<number[] | null> {
  const [vector] = await embedAll([text], "RETRIEVAL_QUERY");
  return vector ?? null;
}
