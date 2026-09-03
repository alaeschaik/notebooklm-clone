import { describe, expect, it } from "vitest";

import { chunkText, estimateTokens, normalizeText } from "./chunk";

const GERMAN = `Die Bundesrepublik Deutschland ist ein Bundesstaat in Mitteleuropa.
Sie besteht aus 16 Ländern und ist als freiheitlich-demokratischer Rechtsstaat verfasst.

Die Bevölkerung beträgt rund 83 Millionen Menschen, z. B. mehr als in Frankreich.
Die Hauptstadt und bevölkerungsreichste Stadt ist Berlin.

Deutschland ist Mitglied der Europäischen Union und der NATO.`;

function paragraph(index: number): string {
  return `This is paragraph number ${index}. It contains several sentences so the chunker has real boundaries to work with. Each sentence ends with punctuation, which the splitter uses to avoid cutting mid-thought.`;
}

const LONG = Array.from({ length: 40 }, (_, i) => paragraph(i)).join("\n\n");

/** The invariant the whole citation pipeline rests on. */
function expectOffsetsExact(text: string, chunks: ReturnType<typeof chunkText>) {
  for (const chunk of chunks) {
    expect(text.slice(chunk.startChar, chunk.endChar)).toBe(chunk.content);
  }
}

describe("normalizeText", () => {
  it("normalises line endings and collapses blank line runs", () => {
    expect(normalizeText("a\r\n\r\n\r\n\r\nb")).toBe("a\n\nb");
  });

  it("strips zero-width characters that PDF extraction leaves behind", () => {
    // These occupy an index but render as nothing, which is what makes a
    // highlight appear misaligned by a character or two.
    expect(normalizeText("wi​dth﻿")).toBe("width");
  });

  it("converts non-breaking spaces to ordinary spaces", () => {
    expect(normalizeText("5 km")).toBe("5 km");
  });

  it("strips trailing whitespace per line but keeps the line", () => {
    expect(normalizeText("a   \nb")).toBe("a\nb");
  });

  it("is idempotent", () => {
    const once = normalizeText(GERMAN);
    expect(normalizeText(once)).toBe(once);
  });
});

describe("chunkText", () => {
  it("returns nothing for empty input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n  ")).toEqual([]);
  });

  it("keeps short text as a single chunk", () => {
    const text = normalizeText(GERMAN);
    const chunks = chunkText(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.content).toBe(text);
    expectOffsetsExact(text, chunks);
  });

  it("preserves exact offsets across many chunks", () => {
    const text = normalizeText(LONG);
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(3);
    expectOffsetsExact(text, chunks);
  });

  it("preserves exact offsets with multi-byte characters", () => {
    // Umlauts and emoji are multi-byte in UTF-8 but single UTF-16 code units
    // (or surrogate pairs). Offsets are JS string indices throughout, so this
    // guards against anyone reintroducing byte-based arithmetic.
    const text = normalizeText(
      Array.from(
        { length: 30 },
        (_, i) => `Größe ${i} — Prüfung mit Emoji 🎧 und Straße. ${paragraph(i)}`,
      ).join("\n\n"),
    );
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    expectOffsetsExact(text, chunks);
    expect(chunks.some((c) => c.content.includes("🎧"))).toBe(true);
  });

  it("covers every non-whitespace character of the source", () => {
    const text = normalizeText(LONG);
    const chunks = chunkText(text);

    for (let i = 0; i < text.length; i++) {
      if (/\s/.test(text[i]!)) continue;
      const covered = chunks.some((c) => i >= c.startChar && i < c.endChar);
      expect(covered, `character ${i} (${text[i]}) is in no chunk`).toBe(true);
    }
  });

  it("overlaps consecutive chunks so context survives the seam", () => {
    const text = normalizeText(LONG);
    const chunks = chunkText(text, { maxChars: 600, overlapChars: 100 });
    expect(chunks.length).toBeGreaterThan(2);

    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i]!.startChar).toBeLessThan(chunks[i - 1]!.endChar);
      expect(chunks[i]!.startChar).toBeGreaterThan(chunks[i - 1]!.startChar);
    }
  });

  it("advances monotonically", () => {
    const chunks = chunkText(normalizeText(LONG), { maxChars: 500 });
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i]!.endChar).toBeGreaterThan(chunks[i - 1]!.endChar);
    }
  });

  it("splits text that has no sentence punctuation at all", () => {
    const text = "word ".repeat(1200).trim();
    const chunks = chunkText(text, { maxChars: 400, overlapChars: 0 });
    expect(chunks.length).toBeGreaterThan(1);
    expectOffsetsExact(text, chunks);
    // Every chunk but the last respects the ceiling exactly; the last may
    // absorb a short trailing fragment.
    for (const chunk of chunks.slice(0, -1)) {
      expect(chunk.content.length).toBeLessThanOrEqual(400);
    }
  });

  it("never exceeds the documented size bound", () => {
    // maxChars is soft: a trailing fragment (< minChars) and the backwards
    // overlap (< overlapChars) can each widen a chunk. Nothing exceeds the sum.
    const minChars = 120;
    const overlapChars = 150;
    for (const maxChars of [300, 400, 900, 1200]) {
      const chunks = chunkText(normalizeText(LONG), {
        maxChars,
        minChars,
        overlapChars,
      });
      for (const chunk of chunks) {
        expect(chunk.content.length).toBeLessThanOrEqual(
          maxChars + minChars + overlapChars,
        );
      }
    }
  });

  it("does not split on abbreviations or decimals", () => {
    const text = normalizeText(GERMAN);
    const chunks = chunkText(text, { maxChars: 200, overlapChars: 0 });
    expectOffsetsExact(text, chunks);
    // "z. B." must not become the end of one chunk and start of the next.
    expect(chunks.some((c) => c.content.trimEnd().endsWith("z."))).toBe(false);
  });

  it("folds a short trailing fragment into the previous chunk", () => {
    const text = normalizeText(`${LONG}\n\nTiny.`);
    const chunks = chunkText(text);
    expect(chunks.at(-1)!.content.length).toBeGreaterThan(120);
    expect(chunks.at(-1)!.content).toContain("Tiny.");
    expectOffsetsExact(text, chunks);
  });
});

describe("estimateTokens", () => {
  it("scales with length", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("a".repeat(400))).toBe(100);
  });
});
