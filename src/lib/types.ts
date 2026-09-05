import type {
  CitationMarker,
  SourceSegment,
  StoredCitation,
} from "@/lib/db/schema";

export type SourceStatus = "pending" | "processing" | "ready" | "failed";
export type SourceKind = "pdf" | "text" | "markdown" | "web" | "youtube";

/** A source as listed in the sidebar — without its full text. */
export type Source = {
  id: string;
  kind: SourceKind;
  title: string;
  url: string | null;
  status: SourceStatus;
  error: string | null;
  charCount: number;
  tokenEstimate: number;
  createdAt: string;
};

/** A source opened in the reader, including the text to highlight in. */
export type SourceDetail = Source & {
  fullText: string | null;
  pageMap: SourceSegment[] | null;
};

export type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: StoredCitation[] | null;
  markers: CitationMarker[] | null;
  createdAt: string;
};

/** Where the reader should scroll to and highlight. */
export type HighlightTarget = {
  sourceId: string;
  startChar: number;
  endChar: number;
};

export type { CitationMarker, StoredCitation, SourceSegment };
