import { eq } from "drizzle-orm";

import { embedAll } from "@/lib/ai/embeddings";
import { labelForOffset } from "@/lib/ai/citations";
import { getDb } from "@/lib/db";
import { chunks, sources } from "@/lib/db/schema";

import { chunkText, estimateTokens } from "./chunk";
import { IngestError, type ExtractedDocument } from "./document";
import { extractPdf } from "./pdf";
import { extractPlainText } from "./text";
import { extractWeb } from "./web";
import { extractYouTube } from "./youtube";

/** Inserted in batches so a large document does not build one enormous query. */
const INSERT_BATCH = 200;

export type IngestInput =
  | { kind: "pdf"; data: Uint8Array; filename: string }
  | { kind: "text" | "markdown"; text: string; title?: string }
  | { kind: "web" | "youtube"; url: string };

async function extract(input: IngestInput): Promise<ExtractedDocument> {
  switch (input.kind) {
    case "pdf":
      return extractPdf(input.data, input.filename);
    case "text":
    case "markdown":
      return extractPlainText(input.text, input.title ?? "Pasted text", {
        inferTitleFromContent: !input.title,
      });
    case "web":
      return extractWeb(input.url);
    case "youtube":
      return extractYouTube(input.url);
  }
}

/**
 * Runs a source from raw input to retrievable chunks, recording progress on the
 * row itself so the UI can show per-source state and a real error message.
 *
 * Failures are caught and stored rather than thrown: one bad URL in a batch of
 * five should mark that one source as failed, not abort the others.
 */
export async function ingestSource(
  sourceId: string,
  input: IngestInput,
): Promise<void> {
  const db = getDb();
  await db
    .update(sources)
    .set({ status: "processing", error: null })
    .where(eq(sources.id, sourceId));

  try {
    const document = await extract(input);

    await db
      .update(sources)
      .set({
        title: document.title,
        fullText: document.text,
        charCount: document.text.length,
        tokenEstimate: estimateTokens(document.text),
        pageMap: document.segments,
        status: "processing",
      })
      .where(eq(sources.id, sourceId));

    const [{ notebookId }] = await db
      .select({ notebookId: sources.notebookId })
      .from(sources)
      .where(eq(sources.id, sourceId));

    const spans = chunkText(document.text);
    if (spans.length === 0) {
      throw new IngestError("This source contains no usable text.");
    }

    const embeddings = await embedAll(spans.map((span) => span.content));

    const rows = spans.map((span, idx) => ({
      sourceId,
      notebookId,
      idx,
      content: span.content,
      startChar: span.startChar,
      endChar: span.endChar,
      segmentLabel: labelForOffset(document.segments, span.startChar) ?? null,
      embedding: embeddings[idx] ?? null,
    }));

    // Replace rather than append, so re-ingesting a source is idempotent.
    await db.delete(chunks).where(eq(chunks.sourceId, sourceId));
    for (let i = 0; i < rows.length; i += INSERT_BATCH) {
      await db.insert(chunks).values(rows.slice(i, i + INSERT_BATCH));
    }

    await db
      .update(sources)
      .set({ status: "ready", error: null })
      .where(eq(sources.id, sourceId));
  } catch (error) {
    const message =
      error instanceof IngestError
        ? error.message
        : "Something went wrong while processing this source. Please try again.";

    if (!(error instanceof IngestError)) {
      console.error(`[ingest] source ${sourceId} failed`, error);
    }

    await db
      .update(sources)
      .set({ status: "failed", error: message })
      .where(eq(sources.id, sourceId));
  }
}
