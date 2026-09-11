import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

import { DocumentBuilder, IngestError, cleanTitle, type ExtractedDocument } from "./document";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_BYTES = 8 * 1024 * 1024;

/** Some sites serve a stub to unknown agents; a browser UA gets the article. */
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function fetchPage(
  url: string,
): Promise<{ body: ArrayBuffer; contentType: string; finalUrl: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new IngestError(`"${url}" is not a valid URL.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new IngestError("Only http and https URLs can be added as sources.");
  }

  const response = await fetch(parsed, {
    headers: { "user-agent": USER_AGENT, accept: "text/html,*/*" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: "follow",
  }).catch((cause) => {
    throw new IngestError(
      `Could not reach ${parsed.hostname}. Check the URL and try again.`,
      { cause },
    );
  });

  if (!response.ok) {
    throw new IngestError(
      `${parsed.hostname} returned ${response.status} ${response.statusText}.`,
    );
  }

  const body = await response.arrayBuffer();
  if (body.byteLength > MAX_BYTES) {
    throw new IngestError("That page is too large to add as a source.");
  }

  return {
    body,
    contentType: response.headers.get("content-type") ?? "",
    finalUrl: response.url || parsed.toString(),
  };
}

/**
 * Strips reference furniture that reads as content once the markup is gone.
 *
 * Wikipedia is the obvious case: "[80]", "[citation needed]" and "[edit]" are
 * navigational in the page but become part of the sentence in plain text, and
 * then get quoted back inside citations.
 */
function stripReferenceMarkers(text: string): string {
  return text
    .replace(/\[\s*(?:\d{1,3}|edit|citation needed|note \d+|[a-z])\s*\]/gi, "")
    .replace(/[ \t]{2,}/g, " ");
}

/**
 * Turns an article into labelled sections using its headings, so a citation can
 * report which section it came from the way a PDF citation reports a page.
 */
function addSections(builder: DocumentBuilder, html: string): void {
  const { document } = parseHTML(`<body>${html}</body>`);
  const blocks = document.querySelectorAll(
    "h1, h2, h3, h4, p, li, blockquote, pre, td",
  );

  let label = "Introduction";
  let buffer: string[] = [];

  const flush = () => {
    if (buffer.length > 0) builder.add(label, buffer.join("\n\n"));
    buffer = [];
  };

  for (const block of blocks) {
    const text = stripReferenceMarkers(block.textContent ?? "").trim();
    if (!text) continue;

    if (/^H[1-4]$/.test(block.tagName)) {
      flush();
      label = cleanTitle(text, label);
      // The heading is part of the readable text, not just a label.
      buffer.push(text);
    } else {
      buffer.push(text);
    }
  }
  flush();
}

export async function extractWeb(url: string): Promise<ExtractedDocument> {
  const { body, contentType, finalUrl } = await fetchPage(url);

  if (contentType.includes("application/pdf")) {
    const { extractPdf } = await import("./pdf");
    return extractPdf(new Uint8Array(body), new URL(finalUrl).hostname);
  }

  const html = new TextDecoder("utf-8").decode(body);
  const { document } = parseHTML(html);
  const fallbackTitle = cleanTitle(
    document.querySelector("title")?.textContent,
    new URL(finalUrl).hostname,
  );

  // Readability strips navigation, adverts and boilerplate. Without it the
  // notebook fills up with cookie banners, which then get cited as sources.
  const article = new Readability(document as never).parse();

  const builder = new DocumentBuilder();
  if (article?.content) {
    addSections(builder, article.content);
  } else if (article?.textContent) {
    builder.add("Article", article.textContent);
  }

  if (builder.isEmpty) {
    throw new IngestError(
      "No readable article text was found on that page. It may require JavaScript or be behind a paywall.",
    );
  }

  return builder.build(cleanTitle(article?.title, fallbackTitle));
}

/** Exposed for tests; not part of the module's public surface. */
export const __testing = { stripReferenceMarkers };
