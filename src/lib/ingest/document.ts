import type { SourceSegment } from "@/lib/db/schema";

import { normalizeText } from "./chunk";

export type ExtractedDocument = {
  title: string;
  /** Canonical text; every offset in the app indexes into this string. */
  text: string;
  /** Labelled regions of `text` — PDF pages, transcript spans. */
  segments: SourceSegment[];
};

/**
 * Raised when a source cannot be ingested. The message is shown to the user on
 * the source card, so it must say what went wrong in plain language — a source
 * that silently ingests as empty text is far worse than one that visibly fails.
 */
export class IngestError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "IngestError";
  }
}

const SEPARATOR = "\n\n";

/**
 * Assembles a document from labelled parts while tracking where each part
 * lands in the final string.
 *
 * Each part is normalised as it is added, so the joined result is already
 * normalised and the recorded offsets stay valid. Normalising the whole
 * document afterwards would shift every offset that was just computed.
 */
export class DocumentBuilder {
  private readonly parts: {
    label: string;
    text: string;
    startSeconds?: number;
  }[] = [];

  add(label: string, raw: string, startSeconds?: number): this {
    const text = normalizeText(raw);
    if (text.length > 0) this.parts.push({ label, text, startSeconds });
    return this;
  }

  get isEmpty(): boolean {
    return this.parts.length === 0;
  }

  build(title: string): ExtractedDocument {
    const segments: SourceSegment[] = [];
    let offset = 0;

    for (const part of this.parts) {
      if (offset > 0) offset += SEPARATOR.length;
      segments.push({
        label: part.label,
        start: offset,
        end: offset + part.text.length,
        ...(part.startSeconds !== undefined
          ? { startSeconds: part.startSeconds }
          : {}),
      });
      offset += part.text.length;
    }

    return {
      title,
      text: this.parts.map((part) => part.text).join(SEPARATOR),
      segments,
    };
  }
}

/** Trims a title to something that fits a source card. */
export function cleanTitle(raw: string | null | undefined, fallback: string): string {
  const title = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!title) return fallback;
  return title.length > 120 ? `${title.slice(0, 117)}…` : title;
}
