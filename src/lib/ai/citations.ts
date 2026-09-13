import type { TextCitation } from "@anthropic-ai/sdk/resources/messages";

import type { SourceSegment, StoredCitation } from "@/lib/db/schema";

/**
 * A document block as sent to Claude, plus what maps a citation about it back
 * to the source. In retrieval mode the document is one chunk, so offsets shift
 * by where it sits; in full-source mode the shift is zero. Same arithmetic.
 */
export type DocumentRef = {
  sourceId: string;
  sourceTitle: string;
  /** Text exactly as sent in the document block. */
  text: string;
  /** Index in the source's canonical `fullText` where `text` begins. */
  offsetInSource: number;
};

/** Citations naming a document we supplied; the union also covers web search. */
export type DocumentCitation = Extract<TextCitation, { document_index: number }>;

function isDocumentCitation(
  citation: TextCitation,
): citation is DocumentCitation {
  return "document_index" in citation;
}

export type CitationResolverOptions = {
  /** Page or timestamp segments per source, used to label a citation. */
  segmentsBySource?: Map<string, SourceSegment[]>;
};

/** Finds the labelled segment (page, timestamp) containing an offset. */
export function labelForOffset(
  segments: SourceSegment[] | undefined,
  offset: number,
): string | undefined {
  if (!segments?.length) return undefined;
  for (const segment of segments) {
    if (offset >= segment.start && offset < segment.end) return segment.label;
  }
  // Past the final segment (trailing whitespace was trimmed): use the last.
  return offset >= segments.at(-1)!.end ? segments.at(-1)!.label : undefined;
}

/**
 * Resolves streaming citations to absolute source ranges and numbers them.
 * A passage cited three times keeps one marker, not three.
 */
export class CitationResolver {
  private readonly refs: DocumentRef[];
  private readonly segmentsBySource: Map<string, SourceSegment[]>;
  private readonly byRange = new Map<string, StoredCitation>();
  private readonly ordered: StoredCitation[] = [];

  constructor(refs: DocumentRef[], options: CitationResolverOptions = {}) {
    this.refs = refs;
    this.segmentsBySource = options.segmentsBySource ?? new Map();
  }

  /**
   * Returns the citation, reusing an existing marker for a repeated passage,
   * or `null` when it cannot be attributed — better no marker than a wrong one.
   */
  add(raw: TextCitation): StoredCitation | null {
    if (!isDocumentCitation(raw)) return null;

    const ref = this.refs[raw.document_index];
    if (!ref) return null;

    const quote = raw.cited_text ?? "";
    const local = locate(ref.text, quote, claimedRange(raw));
    if (!local) return null;

    const startChar = ref.offsetInSource + local.start;
    const endChar = ref.offsetInSource + local.end;

    const key = `${ref.sourceId}:${startChar}:${endChar}`;
    const existing = this.byRange.get(key);
    if (existing) return existing;

    const citation: StoredCitation = {
      index: this.ordered.length + 1,
      sourceId: ref.sourceId,
      sourceTitle: ref.sourceTitle,
      quote,
      startChar,
      endChar,
      segmentLabel: labelForOffset(
        this.segmentsBySource.get(ref.sourceId),
        startChar,
      ),
    };

    this.byRange.set(key, citation);
    this.ordered.push(citation);
    return citation;
  }

  /** Every distinct citation, in the order it was first referenced. */
  all(): StoredCitation[] {
    return [...this.ordered];
  }
}

/** The offsets Claude claims, when the citation type carries any. */
function claimedRange(
  raw: DocumentCitation,
): { start: number; end: number } | undefined {
  return raw.type === "char_location"
    ? { start: raw.start_char_index, end: raw.end_char_index }
    : undefined;
}

/**
 * Offsets are trusted only when they actually produce the quoted text;
 * otherwise the quote is searched for. Verifying rather than trusting is what
 * keeps a highlight off the neighbouring sentence.
 */
function locate(
  text: string,
  quote: string,
  claimed: { start: number; end: number } | undefined,
): { start: number; end: number } | null {
  if (claimed) {
    const { start, end } = claimed;
    const withinBounds = start >= 0 && end <= text.length && start < end;
    if (withinBounds && text.slice(start, end) === quote) return claimed;
  }

  if (quote.length > 0) {
    const found = text.indexOf(quote);
    if (found >= 0) return { start: found, end: found + quote.length };

    // Claude may report the quote with whitespace collapsed or trimmed.
    const relaxed = findRelaxed(text, quote);
    if (relaxed) return relaxed;
  }

  // Last resort: keep the claimed range if it is at least in bounds, so the
  // reader is sent to roughly the right place instead of nowhere.
  if (claimed) {
    const start = Math.max(0, Math.min(claimed.start, text.length));
    const end = Math.max(start, Math.min(claimed.end, text.length));
    if (end > start) return { start, end };
  }

  return null;
}

/** Matches a quote against the text ignoring differences in whitespace runs. */
function findRelaxed(
  text: string,
  quote: string,
): { start: number; end: number } | null {
  const needle = quote.trim().replace(/\s+/g, " ");
  if (needle.length === 0) return null;

  // Build a regex from the quote where every space matches any whitespace run.
  const pattern = needle
    .split(" ")
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");

  const match = new RegExp(pattern).exec(text);
  return match ? { start: match.index, end: match.index + match[0].length } : null;
}
