import { describe, expect, it } from "vitest";

import { normalizeText } from "./chunk";
import { DocumentBuilder, cleanTitle } from "./document";

describe("DocumentBuilder", () => {
  it("records segment offsets that slice back to their own text", () => {
    const doc = new DocumentBuilder()
      .add("p. 1", "First page text.")
      .add("p. 2", "Second page text, a little longer.")
      .add("p. 3", "Third page.")
      .build("Doc");

    expect(doc.segments).toHaveLength(3);
    for (const segment of doc.segments) {
      expect(doc.text.slice(segment.start, segment.end)).not.toContain("\n\n");
    }
    expect(doc.text.slice(doc.segments[1]!.start, doc.segments[1]!.end)).toBe(
      "Second page text, a little longer.",
    );
    expect(doc.text.slice(doc.segments[2]!.start, doc.segments[2]!.end)).toBe(
      "Third page.",
    );
  });

  it("produces text that is already normalised", () => {
    // Offsets are computed at build time, so a later normalisation pass would
    // shift them. The built text must therefore be a fixed point.
    const doc = new DocumentBuilder()
      .add("p. 1", "Ragged   \r\n\r\n\r\n input here.")
      .add("p. 2", "  Padded and spaced  ")
      .build("Doc");

    expect(normalizeText(doc.text)).toBe(doc.text);
  });

  it("skips parts that normalise to nothing", () => {
    const doc = new DocumentBuilder()
      .add("p. 1", "Real content.")
      .add("p. 2", "   \n\n  ")
      .add("p. 3", "More content.")
      .build("Doc");

    expect(doc.segments.map((s) => s.label)).toEqual(["p. 1", "p. 3"]);
  });

  it("carries timestamps for time-based sources", () => {
    const doc = new DocumentBuilder()
      .add("00:00", "Intro words.", 0)
      .add("00:30", "Later words.", 30)
      .build("Talk");

    expect(doc.segments[1]!.startSeconds).toBe(30);
  });

  it("reports emptiness before building", () => {
    const builder = new DocumentBuilder();
    expect(builder.isEmpty).toBe(true);
    builder.add("p. 1", "   ");
    expect(builder.isEmpty).toBe(true);
    builder.add("p. 2", "text");
    expect(builder.isEmpty).toBe(false);
  });
});

describe("cleanTitle", () => {
  it("collapses whitespace", () => {
    expect(cleanTitle("  A   messy\n title ", "x")).toBe("A messy title");
  });

  it("falls back when empty", () => {
    expect(cleanTitle("", "Untitled")).toBe("Untitled");
    expect(cleanTitle(null, "Untitled")).toBe("Untitled");
  });

  it("truncates very long titles", () => {
    const title = cleanTitle("a".repeat(300), "x");
    expect(title).toHaveLength(118);
    expect(title.endsWith("…")).toBe(true);
  });
});
