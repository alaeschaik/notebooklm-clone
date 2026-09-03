import type { TextCitation } from "@anthropic-ai/sdk/resources/messages";
import { describe, expect, it } from "vitest";

import { chunkText, normalizeText } from "@/lib/ingest/chunk";
import type { SourceSegment } from "@/lib/db/schema";

import { CitationResolver, labelForOffset, type DocumentRef } from "./citations";

const SOURCE_ID = "11111111-1111-1111-1111-111111111111";

function charCitation(
  documentIndex: number,
  citedText: string,
  start: number,
  end: number,
): TextCitation {
  return {
    type: "char_location",
    cited_text: citedText,
    document_index: documentIndex,
    document_title: "Doc",
    file_id: null,
    start_char_index: start,
    end_char_index: end,
  };
}

const ARTICLE = normalizeText(
  Array.from(
    { length: 25 },
    (_, i) =>
      `Section ${i} explains a distinct idea. The measured throughput in trial ${i} was ${i * 7} requests per second. Latency stayed within the agreed budget for the whole run.`,
  ).join("\n\n"),
);

describe("CitationResolver", () => {
  it("shifts a chunk-relative citation into absolute source coordinates", () => {
    // The end-to-end property: chunk the source the way ingestion does, cite a
    // sentence inside one chunk the way Claude does, and the resolved range
    // must slice that exact sentence out of the original full text.
    const chunks = chunkText(ARTICLE);
    const target = chunks[3]!;
    const refs: DocumentRef[] = chunks.map((chunk) => ({
      sourceId: SOURCE_ID,
      sourceTitle: "Article",
      text: chunk.content,
      offsetInSource: chunk.startChar,
    }));

    const sentence = "Latency stayed within the agreed budget for the whole run.";
    const localStart = target.content.indexOf(sentence);
    expect(localStart).toBeGreaterThanOrEqual(0);

    const resolver = new CitationResolver(refs);
    const citation = resolver.add(
      charCitation(3, sentence, localStart, localStart + sentence.length),
    )!;

    expect(citation).not.toBeNull();
    expect(citation.sourceId).toBe(SOURCE_ID);
    expect(ARTICLE.slice(citation.startChar, citation.endChar)).toBe(sentence);
  });

  it("resolves full-source citations unchanged", () => {
    const refs: DocumentRef[] = [
      {
        sourceId: SOURCE_ID,
        sourceTitle: "Article",
        text: ARTICLE,
        offsetInSource: 0,
      },
    ];
    const quote = "Section 7 explains a distinct idea.";
    const start = ARTICLE.indexOf(quote);

    const resolver = new CitationResolver(refs);
    const citation = resolver.add(
      charCitation(0, quote, start, start + quote.length),
    )!;

    expect(citation.startChar).toBe(start);
    expect(ARTICLE.slice(citation.startChar, citation.endChar)).toBe(quote);
  });

  it("corrects offsets that do not actually contain the quoted text", () => {
    // Offsets are verified against the quote rather than trusted, so a drifted
    // range still lands on the right sentence instead of a neighbouring one.
    const text = "Alpha comes first. Beta comes second. Gamma comes third.";
    const refs: DocumentRef[] = [
      { sourceId: SOURCE_ID, sourceTitle: "T", text, offsetInSource: 100 },
    ];

    const resolver = new CitationResolver(refs);
    const citation = resolver.add(
      charCitation(0, "Beta comes second.", 0, 18),
    )!;

    expect(text.slice(citation.startChar - 100, citation.endChar - 100)).toBe(
      "Beta comes second.",
    );
  });

  it("matches a quote whose whitespace was collapsed", () => {
    const text = "The result\nwas   clearly    positive across runs.";
    const refs: DocumentRef[] = [
      { sourceId: SOURCE_ID, sourceTitle: "T", text, offsetInSource: 0 },
    ];

    const resolver = new CitationResolver(refs);
    const citation = resolver.add(
      charCitation(0, "The result was clearly positive", 0, 31),
    )!;

    expect(text.slice(citation.startChar, citation.endChar)).toBe(
      "The result\nwas   clearly    positive",
    );
  });

  it("resolves citation types that carry no character offsets", () => {
    // Page locations have no char indices; the quote is located by search.
    const text = "Page content here. The conclusion is unambiguous.";
    const refs: DocumentRef[] = [
      { sourceId: SOURCE_ID, sourceTitle: "T", text, offsetInSource: 0 },
    ];

    const resolver = new CitationResolver(refs);
    const citation = resolver.add({
      type: "page_location",
      cited_text: "The conclusion is unambiguous.",
      document_index: 0,
      document_title: "T",
      file_id: null,
      start_page_number: 2,
      end_page_number: 3,
    })!;

    expect(text.slice(citation.startChar, citation.endChar)).toBe(
      "The conclusion is unambiguous.",
    );
  });

  it("reuses the marker when the same passage is cited again", () => {
    const text = "Alpha. Beta. Gamma.";
    const refs: DocumentRef[] = [
      { sourceId: SOURCE_ID, sourceTitle: "T", text, offsetInSource: 0 },
    ];
    const resolver = new CitationResolver(refs);

    const first = resolver.add(charCitation(0, "Beta.", 7, 12))!;
    const second = resolver.add(charCitation(0, "Beta.", 7, 12))!;
    const other = resolver.add(charCitation(0, "Gamma.", 13, 19))!;

    expect(first.index).toBe(1);
    expect(second.index).toBe(1);
    expect(other.index).toBe(2);
    expect(resolver.all()).toHaveLength(2);
  });

  it("numbers distinct citations in the order they first appear", () => {
    const text = "One. Two. Three.";
    const refs: DocumentRef[] = [
      { sourceId: SOURCE_ID, sourceTitle: "T", text, offsetInSource: 0 },
    ];
    const resolver = new CitationResolver(refs);

    resolver.add(charCitation(0, "Three.", 10, 16));
    resolver.add(charCitation(0, "One.", 0, 4));

    expect(resolver.all().map((c) => [c.index, c.quote])).toEqual([
      [1, "Three."],
      [2, "One."],
    ]);
  });

  it("ignores a citation pointing at a document that was not sent", () => {
    const resolver = new CitationResolver([]);
    expect(resolver.add(charCitation(4, "anything", 0, 8))).toBeNull();
  });

  it("ignores citations that carry no document reference", () => {
    const resolver = new CitationResolver([
      { sourceId: SOURCE_ID, sourceTitle: "T", text: "x", offsetInSource: 0 },
    ]);
    expect(
      resolver.add({
        type: "web_search_result_location",
        cited_text: "unrelated",
        encrypted_index: "abc",
        title: "Some page",
        url: "https://example.com",
      }),
    ).toBeNull();
  });

  it("keeps offsets exact through multi-byte characters", () => {
    const text = normalizeText(
      "Größe und Prüfung 🎧 sind wichtig.\n\nDie Straße war nass. Der Wert lag bei 3,5 %.",
    );
    const refs: DocumentRef[] = [
      { sourceId: SOURCE_ID, sourceTitle: "T", text, offsetInSource: 0 },
    ];
    const quote = "Die Straße war nass.";
    const start = text.indexOf(quote);

    const resolver = new CitationResolver(refs);
    const citation = resolver.add(
      charCitation(0, quote, start, start + quote.length),
    )!;

    expect(text.slice(citation.startChar, citation.endChar)).toBe(quote);
  });

  it("labels a citation with the segment it falls in", () => {
    const segments: SourceSegment[] = [
      { label: "p. 1", start: 0, end: 20 },
      { label: "p. 2", start: 20, end: 60 },
    ];
    const text = "a".repeat(20) + "The finding is on page two.".padEnd(40, " ");
    const refs: DocumentRef[] = [
      { sourceId: SOURCE_ID, sourceTitle: "T", text, offsetInSource: 0 },
    ];

    const resolver = new CitationResolver(refs, {
      segmentsBySource: new Map([[SOURCE_ID, segments]]),
    });
    const citation = resolver.add(
      charCitation(0, "The finding is on page two.", 20, 47),
    )!;

    expect(citation.segmentLabel).toBe("p. 2");
  });
});

describe("labelForOffset", () => {
  const segments: SourceSegment[] = [
    { label: "00:00", start: 0, end: 50 },
    { label: "01:30", start: 50, end: 120 },
  ];

  it("finds the containing segment", () => {
    expect(labelForOffset(segments, 0)).toBe("00:00");
    expect(labelForOffset(segments, 49)).toBe("00:00");
    expect(labelForOffset(segments, 50)).toBe("01:30");
  });

  it("clamps past the end to the final segment", () => {
    expect(labelForOffset(segments, 500)).toBe("01:30");
  });

  it("returns nothing without segments", () => {
    expect(labelForOffset(undefined, 10)).toBeUndefined();
    expect(labelForOffset([], 10)).toBeUndefined();
  });
});
