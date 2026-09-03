import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

/** Dimensionality of OpenAI `text-embedding-3-small`. */
export const EMBEDDING_DIMENSIONS = 1536;

export const sourceKind = pgEnum("source_kind", [
  "pdf",
  "text",
  "markdown",
  "web",
  "youtube",
]);

/** Ingestion is asynchronous, so every source carries its own lifecycle. */
export const sourceStatus = pgEnum("source_status", [
  "pending",
  "processing",
  "ready",
  "failed",
]);

export const messageRole = pgEnum("message_role", ["user", "assistant"]);

export const studioKind = pgEnum("studio_kind", [
  "summary",
  "briefing",
  "study_guide",
  "faq",
  "timeline",
]);

/** Shared by studio documents, audio overviews and mind maps. */
export const jobStatus = pgEnum("job_status", [
  "pending",
  "running",
  "ready",
  "failed",
]);

export const noteOrigin = pgEnum("note_origin", ["manual", "chat", "studio"]);

// ---------------------------------------------------------------------------

export const notebooks = pgTable(
  "notebooks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Anonymous visitor id from the signed session cookie. */
    ownerId: text("owner_id").notNull(),
    title: text("title").notNull(),
    emoji: text("emoji").notNull().default("📓"),
    /** Set when the notebook is shared; `null` means private. */
    publicSlug: text("public_slug"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("notebooks_owner_idx").on(t.ownerId, t.updatedAt),
    uniqueIndex("notebooks_public_slug_idx").on(t.publicSlug),
  ],
);

/**
 * A source stores one canonical `fullText`. Every citation offset in the app —
 * from chunks, from Claude, from the viewer highlight — indexes into this exact
 * string, which is what makes citations resolvable back to a precise passage.
 */
export const sources = pgTable(
  "sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    notebookId: uuid("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    kind: sourceKind("kind").notNull(),
    title: text("title").notNull(),
    /** Origin URL for web and YouTube sources. */
    url: text("url"),
    /** Blob URL of the uploaded original, when there is one. */
    blobUrl: text("blob_url"),
    status: sourceStatus("status").notNull().default("pending"),
    /** Human-readable reason a source failed to ingest. */
    error: text("error"),
    fullText: text("full_text"),
    charCount: integer("char_count").notNull().default(0),
    tokenEstimate: integer("token_estimate").notNull().default(0),
    /**
     * Maps regions of `fullText` back to their origin so a citation can be
     * reported as "page 4" or "12:30". Shape: `{ label, start, end }[]`.
     */
    pageMap: jsonb("page_map").$type<SourceSegment[]>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("sources_notebook_idx").on(t.notebookId, t.createdAt)],
);

export const chunks = pgTable(
  "chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    /** Denormalised so retrieval can filter by notebook without a join. */
    notebookId: uuid("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    content: text("content").notNull(),
    /** Offsets into the parent source's `fullText`. */
    startChar: integer("start_char").notNull(),
    endChar: integer("end_char").notNull(),
    /** Label of the segment this chunk starts in, e.g. "p. 3" or "04:12". */
    segmentLabel: text("segment_label"),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("chunks_source_idx").on(t.sourceId, t.idx),
    index("chunks_notebook_idx").on(t.notebookId),
    // Cosine distance matches the normalised vectors OpenAI returns.
    index("chunks_embedding_idx")
      .using("hnsw", t.embedding.op("vector_cosine_ops")),
    // Lexical half of hybrid retrieval. The 'simple' dictionary is deliberate:
    // notebooks mix German and English, and stemming for the wrong language
    // hurts more than no stemming at all.
    index("chunks_fts_idx").using(
      "gin",
      sql`to_tsvector('simple', ${t.content})`,
    ),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    notebookId: uuid("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    role: messageRole("role").notNull(),
    content: text("content").notNull(),
    /** Resolved citations attached to an assistant answer. */
    citations: jsonb("citations").$type<StoredCitation[]>(),
    /** Which sources were in scope when the question was asked. */
    scopedSourceIds: jsonb("scoped_source_ids").$type<string[]>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("messages_notebook_idx").on(t.notebookId, t.createdAt)],
);

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    notebookId: uuid("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content").notNull(),
    origin: noteOrigin("origin").notNull().default("manual"),
    citations: jsonb("citations").$type<StoredCitation[]>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("notes_notebook_idx").on(t.notebookId, t.createdAt)],
);

export const studioDocs = pgTable(
  "studio_docs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    notebookId: uuid("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    kind: studioKind("kind").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    citations: jsonb("citations").$type<StoredCitation[]>(),
    status: jobStatus("status").notNull().default("pending"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("studio_docs_notebook_idx").on(t.notebookId, t.createdAt)],
);

/**
 * Audio is rendered one segment per request so no single call approaches the
 * platform's function timeout; `segments` tracks that progress.
 */
export const audioOverviews = pgTable(
  "audio_overviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    notebookId: uuid("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    status: jobStatus("status").notNull().default("pending"),
    error: text("error"),
    script: jsonb("script").$type<DialogueTurn[]>(),
    segments: jsonb("segments").$type<AudioSegment[]>(),
    audioUrl: text("audio_url"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("audio_overviews_notebook_idx").on(t.notebookId, t.createdAt)],
);

export const mindMaps = pgTable(
  "mind_maps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    notebookId: uuid("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    status: jobStatus("status").notNull().default("pending"),
    error: text("error"),
    data: jsonb("data").$type<MindMapNode | null>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("mind_maps_notebook_idx").on(t.notebookId, t.createdAt)],
);

// --- Relations -------------------------------------------------------------

export const notebooksRelations = relations(notebooks, ({ many }) => ({
  sources: many(sources),
  messages: many(messages),
  notes: many(notes),
  studioDocs: many(studioDocs),
  audioOverviews: many(audioOverviews),
  mindMaps: many(mindMaps),
}));

export const sourcesRelations = relations(sources, ({ one, many }) => ({
  notebook: one(notebooks, {
    fields: [sources.notebookId],
    references: [notebooks.id],
  }),
  chunks: many(chunks),
}));

export const chunksRelations = relations(chunks, ({ one }) => ({
  source: one(sources, {
    fields: [chunks.sourceId],
    references: [sources.id],
  }),
}));

// --- JSON column shapes ----------------------------------------------------

/** A labelled region of a source's `fullText` (a PDF page, a transcript span). */
export type SourceSegment = {
  label: string;
  start: number;
  end: number;
  /** Seconds into the media, for timestamped sources like YouTube. */
  startSeconds?: number;
};

/**
 * A citation after it has been resolved from Claude's document-relative
 * coordinates into absolute offsets in the cited source's `fullText`.
 */
export type StoredCitation = {
  /** 1-based marker rendered inline in the answer. */
  index: number;
  sourceId: string;
  sourceTitle: string;
  quote: string;
  startChar: number;
  endChar: number;
  segmentLabel?: string;
};

export type DialogueTurn = { speaker: string; text: string };

export type AudioSegment = {
  idx: number;
  /** Indices into the script's turn array covered by this segment. */
  turnStart: number;
  turnEnd: number;
  status: "pending" | "ready" | "failed";
  blobUrl?: string;
  byteLength?: number;
  error?: string;
};

export type MindMapNode = {
  label: string;
  summary?: string;
  children?: MindMapNode[];
};
