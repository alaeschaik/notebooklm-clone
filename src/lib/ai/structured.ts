import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { sources } from "@/lib/db/schema";

import { recordAiCall } from "@/lib/observability/ai";

import { MODEL, getClaude } from "./claude";

/**
 * Structured outputs and citations are mutually exclusive — enabling both
 * returns a 400. So anything that needs machine-readable JSON (the podcast
 * script, the mind map) reads its sources as plain text and forgoes citations,
 * while prose output (chat, studio documents) keeps citations and forgoes JSON.
 */
const STRUCTURED_BETA = "structured-outputs-2025-11-13";

export async function generateStructured<T>({
  system,
  prompt,
  schema,
  effort = "medium",
  maxTokens = 8000,
  operation = "structured",
}: {
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
  /** Labels the cost and token counters, so spend is attributable per feature. */
  operation?: string;
}): Promise<T> {
  const response = await recordAiCall(
    { provider: "anthropic", model: MODEL, operation },
    () =>
      getClaude().beta.messages.create({
        model: MODEL,
        betas: [STRUCTURED_BETA],
        max_tokens: maxTokens,
        thinking: { type: "adaptive" },
        output_config: { effort, format: { type: "json_schema", schema } },
        system,
        messages: [{ role: "user", content: prompt }],
      }),
    (result) => ({
      input: result.usage.input_tokens,
      output: result.usage.output_tokens,
      cachedInput: result.usage.cache_read_input_tokens ?? undefined,
    }),
  );

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  try {
    return JSON.parse(text) as T;
  } catch (cause) {
    throw new Error("The model returned output that was not valid JSON.", {
      cause,
    });
  }
}

/** Characters of source material handed to a non-cited generation. */
const MAX_SOURCE_CHARS = 400_000;

/**
 * Loads selected sources as plain text. Long notebooks are truncated evenly
 * across sources rather than by taking the first few whole: a podcast that
 * only ever discusses source one would be a worse failure than one that
 * covers every source a little more shallowly.
 */
export async function loadSourceText(
  notebookId: string,
  sourceIds: string[],
): Promise<{ text: string; titles: string[] }> {
  if (sourceIds.length === 0) return { text: "", titles: [] };

  const rows = await getDb()
    .select({
      title: sources.title,
      fullText: sources.fullText,
    })
    .from(sources)
    .where(
      and(
        eq(sources.notebookId, notebookId),
        eq(sources.status, "ready"),
        inArray(sources.id, sourceIds),
      ),
    );

  const usable = rows.filter(
    (row): row is { title: string; fullText: string } => Boolean(row.fullText),
  );
  if (usable.length === 0) return { text: "", titles: [] };

  const budget = Math.floor(MAX_SOURCE_CHARS / usable.length);
  const text = usable
    .map((row) => {
      const body =
        row.fullText.length > budget
          ? `${row.fullText.slice(0, budget)}\n[…truncated]`
          : row.fullText;
      return `<source title="${row.title.replace(/"/g, "'")}">\n${body}\n</source>`;
    })
    .join("\n\n");

  return { text, titles: usable.map((row) => row.title) };
}
