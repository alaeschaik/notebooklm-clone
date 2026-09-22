import { GoogleGenAI } from "@google/genai";

import { recordAiCall } from "@/lib/observability/ai";
import { EMBEDDING_DIMENSIONS } from "@/lib/db/schema";

import { logger } from "@/lib/observability/logger";

const log = logger("embeddings");

/**
 * Gemini rather than OpenAI: a Gemini key is already needed for audio, and its
 * embedding endpoint is on the free tier.
 *
 * Changing this model invalidates every stored vector — embeddings from
 * different models are not comparable — so a switch means re-ingesting.
 */
export const EMBEDDING_MODEL = "gemini-embedding-001";

/** Inputs per request, kept well inside the endpoint's batch limit. */
const BATCH_SIZE = 64;

/** Roughly the model's input ceiling, in characters. */
const MAX_INPUT_CHARS = 30_000;

let client: GoogleGenAI | undefined;

/**
 * Embeddings are an enhancement. Without a key, ranking falls back to full-text
 * alone, and notebooks small enough to be sent whole never touch the index.
 */
function embeddingsEnabled(): boolean {
  // .env.example ships a placeholder; treating it as real errors every ingest.
  const key = process.env.GEMINI_API_KEY?.trim();
  return Boolean(key) && !key!.endsWith("...");
}

function getClient(): GoogleGenAI {
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

/**
 * Gemini distinguishes the two sides of a retrieval pair. A question and the
 * passage answering it are not paraphrases, and embedding them alike hurts.
 */
type TaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

async function embedBatch(
  texts: string[],
  taskType: TaskType,
): Promise<(number[] | null)[]> {
  const response = await recordAiCall(
    { provider: "gemini", model: EMBEDDING_MODEL, operation: `embed:${taskType}` },
    () =>
      getClient().models.embedContent({
        model: EMBEDDING_MODEL,
        contents: texts,
        config: { outputDimensionality: EMBEDDING_DIMENSIONS, taskType },
      }),
    // The endpoint reports no usage, so only the call itself is counted.
    () => undefined,
  );

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
    log.warn("no API key — storing chunks without vectors, retrieval falls back to full-text");
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
      // A source without vectors is still readable and citable; a source that
      // failed to ingest is useless. Loud, because ranking quality does drop.
      log.error("batch failed — storing it without vectors", { error });
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
