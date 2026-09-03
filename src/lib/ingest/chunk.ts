/**
 * Text is chunked into overlapping ranges of the source's canonical `fullText`.
 *
 * The invariant every consumer relies on is:
 *
 *     fullText.slice(chunk.startChar, chunk.endChar) === chunk.content
 *
 * Citations are resolved by adding Claude's document-relative offsets to
 * `chunk.startChar`, so if that invariant ever breaks, every highlight in the
 * app silently points at the wrong passage. It is asserted in the tests.
 */

export type TextSpan = {
  content: string;
  startChar: number;
  endChar: number;
};

export type ChunkOptions = {
  /**
   * Soft ceiling for a chunk, in characters. Two things widen a chunk past it:
   * folding in a short trailing fragment (< `minChars`) and the backwards
   * overlap (< `overlapChars`). Nothing exceeds the sum of the three.
   */
  maxChars?: number;
  /** How much of the previous chunk to repeat, to preserve context at seams. */
  overlapChars?: number;
  /** Chunks shorter than this are merged into their neighbour. */
  minChars?: number;
};

const DEFAULTS = {
  maxChars: 1200,
  overlapChars: 150,
  minChars: 120,
} satisfies Required<ChunkOptions>;

/**
 * Normalises raw extracted text. Must run *before* any offset is computed, and
 * the result is what gets stored as `fullText` — normalising later would shift
 * every stored offset out from under the citations that reference them.
 */
export function normalizeText(raw: string): string {
  return (
    raw
      // Windows and old Mac line endings.
      .replace(/\r\n?/g, "\n")
      // Zero-width and BOM characters that PDF extraction leaves behind. These
      // occupy an index but render as nothing, which makes highlights look
      // misaligned by a character or two.
      .replace(/[​-‍﻿]/g, "")
      // Non-breaking and other exotic spaces become ordinary spaces.
      .replace(/[   ]/g, " ")
      // Trailing whitespace on each line.
      .replace(/[ \t]+$/gm, "")
      // Collapse runs of blank lines to a single paragraph break.
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/** Rough token estimate. Good enough to choose a retrieval strategy. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function trimSpan(text: string, start: number, end: number): TextSpan | null {
  let s = start;
  let e = end;
  while (s < e && /\s/.test(text[s]!)) s++;
  while (e > s && /\s/.test(text[e - 1]!)) e--;
  if (s >= e) return null;
  return { content: text.slice(s, e), startChar: s, endChar: e };
}

/** Splits on blank lines, returning whitespace-trimmed spans. */
function splitParagraphs(text: string): TextSpan[] {
  const spans: TextSpan[] = [];
  const separator = /\n[ \t]*\n\s*/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = separator.exec(text)) !== null) {
    const span = trimSpan(text, cursor, match.index);
    if (span) spans.push(span);
    cursor = match.index + match[0].length;
  }
  const tail = trimSpan(text, cursor, text.length);
  if (tail) spans.push(tail);

  return spans;
}

/**
 * Splits a span after sentence-ending punctuation. The lookbehind keeps the
 * punctuation with the sentence it belongs to, and requires trailing
 * whitespace so decimals and abbreviations like "z. B." are not split.
 */
function splitSentences(text: string, span: TextSpan): TextSpan[] {
  const spans: TextSpan[] = [];
  const boundary = /(?<=[.!?…][")'\]»]?)\s+/g;
  boundary.lastIndex = 0;

  const slice = text.slice(span.startChar, span.endChar);
  let cursor = span.startChar;
  let match: RegExpExecArray | null;

  while ((match = boundary.exec(slice)) !== null) {
    const absoluteEnd = span.startChar + match.index;
    const sentence = trimSpan(text, cursor, absoluteEnd);
    if (sentence) spans.push(sentence);
    cursor = span.startChar + match.index + match[0].length;
  }
  const tail = trimSpan(text, cursor, span.endChar);
  if (tail) spans.push(tail);

  return spans.length > 0 ? spans : [span];
}

/** Last-resort split for content with no sentence punctuation, e.g. tables. */
function splitHard(text: string, span: TextSpan, maxChars: number): TextSpan[] {
  const spans: TextSpan[] = [];
  let cursor = span.startChar;

  while (cursor < span.endChar) {
    let end = Math.min(cursor + maxChars, span.endChar);

    if (end < span.endChar) {
      // Prefer to break at whitespace, but only if one is reasonably close;
      // otherwise accept a mid-word break rather than emit a tiny chunk.
      const window = text.slice(cursor, end);
      const lastSpace = window.search(/\s\S*$/);
      if (lastSpace > maxChars * 0.6) end = cursor + lastSpace;
    }

    const piece = trimSpan(text, cursor, end);
    if (piece) spans.push(piece);
    cursor = end;
  }

  return spans;
}

/** Breaks the text into atoms no larger than `maxChars` wherever possible. */
function toAtoms(text: string, maxChars: number): TextSpan[] {
  const atoms: TextSpan[] = [];

  for (const paragraph of splitParagraphs(text)) {
    if (paragraph.content.length <= maxChars) {
      atoms.push(paragraph);
      continue;
    }

    for (const sentence of splitSentences(text, paragraph)) {
      if (sentence.content.length <= maxChars) {
        atoms.push(sentence);
      } else {
        atoms.push(...splitHard(text, sentence, maxChars));
      }
    }
  }

  return atoms;
}

export function chunkText(text: string, options: ChunkOptions = {}): TextSpan[] {
  const { maxChars, overlapChars, minChars } = { ...DEFAULTS, ...options };
  if (text.length === 0) return [];

  const atoms = toAtoms(text, maxChars);
  if (atoms.length === 0) return [];

  // Group atoms greedily into chunk-sized runs.
  const groups: TextSpan[][] = [];
  let current: TextSpan[] = [];
  let currentLength = 0;

  for (const atom of atoms) {
    const projected = currentLength === 0 ? atom.content.length : currentLength + 2 + atom.content.length;

    if (current.length > 0 && projected > maxChars) {
      groups.push(current);
      current = [atom];
      currentLength = atom.content.length;
    } else {
      current.push(atom);
      currentLength = projected;
    }
  }
  if (current.length > 0) groups.push(current);

  // A trailing fragment embeds to noise on its own, so fold it into the
  // previous chunk. That overshoots maxChars, which is why maxChars is a soft
  // ceiling — but the overshoot is bounded: the fragment is shorter than
  // minChars by definition, so no chunk can exceed maxChars + minChars.
  if (groups.length > 1) {
    const last = groups.at(-1)!;
    const lastLength = last.at(-1)!.endChar - last[0]!.startChar;
    if (lastLength < minChars) {
      groups.at(-2)!.push(...last);
      groups.pop();
    }
  }

  return groups.map((group, i) => {
    const end = group.at(-1)!.endChar;
    let start = group[0]!.startChar;

    // Extend backwards into the previous chunk so context is not lost at the
    // seam. Widening the range (rather than prepending copied text) is what
    // keeps `slice(start, end) === content` true.
    if (i > 0 && overlapChars > 0) {
      const previousStart = groups[i - 1]![0]!.startChar;
      const target = Math.max(start - overlapChars, previousStart + 1, 0);
      const boundary = text.indexOf(" ", target);
      start = boundary >= 0 && boundary < start ? boundary + 1 : target;
    }

    return { content: text.slice(start, end), startChar: start, endChar: end };
  });
}
