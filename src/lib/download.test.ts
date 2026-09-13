import { describe, expect, it } from "vitest";

import { toFilename, toMarkdownDocument } from "./download";

const citations = [
  {
    index: 1,
    sourceId: "s1",
    sourceTitle: "Kestrel Dam Report",
    quote: "Sediment surveys in 2024 measured 61 million tonnes.",
    startChar: 0,
    endChar: 52,
    segmentLabel: "p. 3",
  },
  {
    index: 2,
    sourceId: "s2",
    sourceTitle: "Hydroelectricity",
    quote: "Hydropower supplies 15% of the world's\nelectricity.",
    startChar: 10,
    endChar: 60,
  },
];

describe("toMarkdownDocument", () => {
  it("renders a title, the body and a sources section", () => {
    const md = toMarkdownDocument({
      title: "Briefing doc",
      content: "Sediment is accumulating faster than forecast.",
      citations,
      markers: [{ position: 45, index: 1 }],
      sourcesHeading: "Sources",
    });

    expect(md).toContain("# Briefing doc");
    expect(md).toContain("## Sources");
    expect(md).toContain("**Kestrel Dam Report** (p. 3)");
    expect(md.endsWith("\n")).toBe(true);
  });

  it("turns inline markers into readable references", () => {
    // On screen a marker is an invisible delimiter the renderer swaps for a
    // chip. In a text file it has to survive as something a reader can see.
    const md = toMarkdownDocument({
      title: "Doc",
      content: "Sediment exceeded forecast.",
      citations,
      markers: [{ position: 27, index: 1 }],
      sourcesHeading: "Sources",
    });

    expect(md).toContain("Sediment exceeded forecast.[1]");
    expect(md).not.toContain("⁢");
  });

  it("collapses newlines inside a quoted passage", () => {
    const md = toMarkdownDocument({
      title: "Doc",
      content: "Body.",
      citations,
      sourcesHeading: "Sources",
    });
    // A raw newline would break out of the blockquote and orphan the rest.
    expect(md).toContain("> Hydropower supplies 15% of the world's electricity.");
  });

  it("omits the sources section when nothing was cited", () => {
    const md = toMarkdownDocument({
      title: "Doc",
      content: "Body.",
      sourcesHeading: "Sources",
    });
    expect(md).not.toContain("## Sources");
    expect(md.trim()).toBe("# Doc\n\nBody.");
  });
});

describe("toFilename", () => {
  it("slugifies a title", () => {
    expect(toFilename("Briefing doc", "md")).toBe("briefing-doc.md");
    expect(toFilename("FAQ / Q&A!", "md")).toBe("faq-q-a.md");
  });

  it("folds accents rather than escaping them", () => {
    expect(toFilename("Zusammenfassung für Prüfung", "md")).toBe(
      "zusammenfassung-fur-prufung.md",
    );
  });

  it("falls back when a title slugifies to nothing", () => {
    expect(toFilename("???", "md")).toBe("document.md");
    expect(toFilename("", "md")).toBe("document.md");
  });

  it("caps the length", () => {
    expect(toFilename("a".repeat(200), "md").length).toBeLessThanOrEqual(63);
  });
});
