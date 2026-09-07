import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages";
import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { sources, type SourceSegment } from "@/lib/db/schema";

import type { DocumentRef } from "./citations";
import { embedQuery } from "./embeddings";
import { retrieveChunks } from "./retrieval";

/**
 * Below this many tokens the whole notebook is sent verbatim instead of being
 * retrieved over. Retrieval can only lose information, so it is worth avoiding
 * while the sources still fit comfortably inside the context window — and with
 * the documents cached, follow-up questions cost little more than a short one.
 */
export const FULL_CONTEXT_TOKEN_BUDGET = 180_000;

export type ContextMode = "full" | "retrieval";

export type NotebookContext = {
  mode: ContextMode;
  /** Document blocks, in the order Claude will index them by. */
  blocks: BetaContentBlockParam[];
  /** Parallel to `blocks`, for translating citations back to sources. */
  refs: DocumentRef[];
  segmentsBySource: Map<string, SourceSegment[]>;
  /** Titles of the sources actually included, for the empty-state message. */
  sourceTitles: string[];
};

type LoadedSource = {
  id: string;
  title: string;
  kind: string;
  fullText: string;
  tokenEstimate: number;
  pageMap: SourceSegment[] | null;
};

async function loadSources(
  notebookId: string,
  sourceIds: string[],
): Promise<LoadedSource[]> {
  if (sourceIds.length === 0) return [];

  const rows = await getDb()
    .select({
      id: sources.id,
      title: sources.title,
      kind: sources.kind,
      fullText: sources.fullText,
      tokenEstimate: sources.tokenEstimate,
      pageMap: sources.pageMap,
    })
    .from(sources)
    .where(
      and(
        eq(sources.notebookId, notebookId),
        eq(sources.status, "ready"),
        inArray(sources.id, sourceIds),
      ),
    );

  return rows.flatMap((row) =>
    row.fullText ? [{ ...row, fullText: row.fullText }] : [],
  );
}

function documentBlock({
  text,
  title,
  context,
  cache,
}: {
  text: string;
  title: string;
  context: string;
  cache: boolean;
}): BetaContentBlockParam {
  return {
    type: "document",
    source: { type: "text", media_type: "text/plain", data: text },
    title,
    // Passed to the model but never cited from, so it is the right place for
    // provenance the model should know but should not quote back.
    context,
    citations: { enabled: true },
    ...(cache ? { cache_control: { type: "ephemeral" as const } } : {}),
  };
}

/**
 * Assembles the grounding documents for a question.
 *
 * Small notebooks are sent whole; larger ones go through hybrid retrieval.
 * Both paths produce the same pair of parallel arrays — the blocks Claude
 * sees and the refs needed to map its citations back — so everything
 * downstream is identical regardless of which path ran.
 */
export async function buildContext({
  notebookId,
  sourceIds,
  question,
}: {
  notebookId: string;
  sourceIds: string[];
  question: string;
}): Promise<NotebookContext> {
  const loaded = await loadSources(notebookId, sourceIds);

  const segmentsBySource = new Map<string, SourceSegment[]>();
  for (const source of loaded) {
    if (source.pageMap?.length) segmentsBySource.set(source.id, source.pageMap);
  }

  if (loaded.length === 0) {
    return {
      mode: "full",
      blocks: [],
      refs: [],
      segmentsBySource,
      sourceTitles: [],
    };
  }

  const totalTokens = loaded.reduce((sum, s) => sum + s.tokenEstimate, 0);

  if (totalTokens <= FULL_CONTEXT_TOKEN_BUDGET) {
    const blocks = loaded.map((source, i) =>
      documentBlock({
        text: source.fullText,
        title: source.title,
        context: `A ${source.kind} source in the user's notebook, included in full.`,
        // Caching the final block covers every document before it, so repeat
        // questions against the same notebook re-read them cheaply.
        cache: i === loaded.length - 1,
      }),
    );

    return {
      mode: "full",
      blocks,
      refs: loaded.map((source) => ({
        sourceId: source.id,
        sourceTitle: source.title,
        text: source.fullText,
        offsetInSource: 0,
      })),
      segmentsBySource,
      sourceTitles: loaded.map((s) => s.title),
    };
  }

  const chunks = await retrieveChunks({
    notebookId,
    sourceIds: loaded.map((s) => s.id),
    queryEmbedding: await embedQuery(question),
    queryText: question,
  });

  return {
    mode: "retrieval",
    blocks: chunks.map((chunk) =>
      documentBlock({
        text: chunk.content,
        title: chunk.sourceTitle,
        context: chunk.segmentLabel
          ? `Excerpt from "${chunk.sourceTitle}" (${chunk.segmentLabel}).`
          : `Excerpt from "${chunk.sourceTitle}".`,
        cache: false,
      }),
    ),
    refs: chunks.map((chunk) => ({
      sourceId: chunk.sourceId,
      sourceTitle: chunk.sourceTitle,
      text: chunk.content,
      offsetInSource: chunk.startChar,
    })),
    segmentsBySource,
    sourceTitles: [...new Set(chunks.map((c) => c.sourceTitle))],
  };
}
