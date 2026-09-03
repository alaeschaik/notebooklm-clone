import { DocumentBuilder, IngestError, cleanTitle, type ExtractedDocument } from "./document";

/** Derives a title from the first markdown heading or the first line. */
function inferTitle(text: string, fallback: string): string {
  const heading = /^#{1,3}\s+(.+)$/m.exec(text);
  if (heading) return cleanTitle(heading[1], fallback);

  const firstLine = text.trimStart().split("\n", 1)[0] ?? "";
  return firstLine.length > 0 && firstLine.length <= 120
    ? cleanTitle(firstLine, fallback)
    : fallback;
}

export function extractPlainText(
  raw: string,
  fallbackTitle: string,
  options: { inferTitleFromContent?: boolean } = {},
): ExtractedDocument {
  const builder = new DocumentBuilder().add("Text", raw);

  if (builder.isEmpty) {
    throw new IngestError("This source is empty — there is no text to add.");
  }

  const title = options.inferTitleFromContent
    ? inferTitle(raw, fallbackTitle)
    : fallbackTitle;

  const document = builder.build(title);
  // A single unlabelled block: citations into pasted text have no page or
  // timestamp to report, so drop the placeholder segment entirely.
  return { ...document, segments: [] };
}
