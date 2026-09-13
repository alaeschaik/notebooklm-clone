import { weaveMarkers } from "@/lib/citation-markers";
import type { CitationMarker, StoredCitation } from "@/lib/types";

/**
 * Renders a studio document as self-contained Markdown.
 *
 * Citations are the point of this app, so a downloaded document keeps them: the
 * inline markers are woven back into the prose as `[1]`, and every source is
 * listed at the end with the passage it was drawn from. A file that dropped
 * them would be a worse artefact than the screen it came from.
 */
export function toMarkdownDocument({
  title,
  content,
  citations = [],
  markers = [],
  sourcesHeading,
}: {
  title: string;
  content: string;
  citations?: StoredCitation[];
  markers?: CitationMarker[];
  sourcesHeading: string;
}): string {
  // The on-screen markers are an invisible delimiter the renderer swaps for
  // chips; in a text file they have to become something readable.
  const body = weaveMarkers(content, markers).replace(
    /⁢(\d+)⁢/g,
    (_, index: string) => `[${index}]`,
  );

  const sections = [`# ${title}`, body.trim()];

  if (citations.length > 0) {
    const list = citations
      .map((citation) => {
        const where = citation.segmentLabel ? ` (${citation.segmentLabel})` : "";
        const quote = citation.quote.trim().replace(/\s+/g, " ");
        return `${citation.index}. **${citation.sourceTitle}**${where}\n   > ${quote}`;
      })
      .join("\n");
    sections.push(`## ${sourcesHeading}\n\n${list}`);
  }

  return sections.join("\n\n") + "\n";
}

/** A filesystem-safe filename derived from a document title. */
export function toFilename(title: string, extension: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    // Strip combining marks so "Zusammenfassung für Prüfung" does not become
    // a name full of percent escapes on download.
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  return `${slug || "document"}.${extension}`;
}

/** Hands the file to the browser. No-op outside one. */
export function downloadText(filename: string, text: string, type = "text/markdown") {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking immediately can cancel the download in some browsers; one frame
  // is enough for the click to have been handled.
  requestAnimationFrame(() => URL.revokeObjectURL(url));
}
