import { extractText, getMeta } from "unpdf";

import { DocumentBuilder, IngestError, cleanTitle, type ExtractedDocument } from "./document";

/**
 * Extracts a PDF page by page so citations can report the page they came from.
 * Merging pages first would make that impossible to recover.
 */
export async function extractPdf(
  data: Uint8Array,
  fallbackTitle: string,
): Promise<ExtractedDocument> {
  let pages: string[];
  let title = fallbackTitle;

  try {
    const result = await extractText(data, { mergePages: false });
    pages = result.text;
  } catch (cause) {
    throw new IngestError(
      "This PDF could not be read. It may be corrupted or password-protected.",
      { cause },
    );
  }

  try {
    const meta = await getMeta(data);
    title = cleanTitle(meta.info?.Title as string | undefined, fallbackTitle);
  } catch {
    // Metadata is a nicety; the filename is a perfectly good title.
  }

  const builder = new DocumentBuilder();
  pages.forEach((page, i) => builder.add(`p. ${i + 1}`, page));

  if (builder.isEmpty) {
    throw new IngestError(
      "No text could be extracted from this PDF. It is most likely a scan — try a text-based PDF, or paste the text directly.",
    );
  }

  return builder.build(title);
}
