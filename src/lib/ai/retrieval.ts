import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db";

export type RetrievedChunk = {
  chunkId: string;
  sourceId: string;
  sourceTitle: string;
  content: string;
  startChar: number;
  segmentLabel: string | null;
  score: number;
};

/** Rank-fusion damping. 60 is the value from the original RRF paper. */
const RRF_K = 60;

/** How deep each retrieval arm searches before the two are fused. */
const ARM_DEPTH = 40;

export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

/**
 * Hybrid retrieval: semantic similarity and lexical matching are ranked
 * independently, then combined with reciprocal rank fusion.
 *
 * Neither arm is sufficient alone. Embeddings miss exact identifiers — a part
 * number or a surname is semantically bland but is often precisely what the
 * question is about. Full-text misses paraphrase, which is most questions.
 * Fusing ranks rather than scores avoids having to calibrate two
 * incomparable score scales against each other.
 */
export async function retrieveChunks({
  notebookId,
  sourceIds,
  queryEmbedding,
  queryText,
  limit = 24,
}: {
  notebookId: string;
  sourceIds: string[];
  queryEmbedding: number[];
  queryText: string;
  limit?: number;
}): Promise<RetrievedChunk[]> {
  if (sourceIds.length === 0) return [];

  const vector = toVectorLiteral(queryEmbedding);
  const db = getDb();

  // Bound parameters, never interpolation: these ids arrive in a request body.
  const scopedIds = sql.join(
    sourceIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );

  const result = await db.execute<{
    chunk_id: string;
    source_id: string;
    source_title: string;
    content: string;
    start_char: number;
    segment_label: string | null;
    score: number;
  }>(sql`
    WITH scoped AS (
      SELECT c.id, c.source_id, c.content, c.start_char, c.segment_label, c.embedding
      FROM chunks c
      WHERE c.notebook_id = ${notebookId}
        AND c.source_id IN (${scopedIds})
    ),
    semantic AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY embedding <=> ${vector}::vector) AS rank
      FROM scoped
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> ${vector}::vector
      LIMIT ${ARM_DEPTH}
    ),
    lexical AS (
      SELECT id, ROW_NUMBER() OVER (
        ORDER BY ts_rank_cd(to_tsvector('simple', content), q.query) DESC
      ) AS rank
      FROM scoped, plainto_tsquery('simple', ${queryText}) AS q(query)
      WHERE to_tsvector('simple', content) @@ q.query
      LIMIT ${ARM_DEPTH}
    ),
    fused AS (
      SELECT
        COALESCE(s.id, l.id) AS id,
        COALESCE(1.0 / (${RRF_K} + s.rank), 0) + COALESCE(1.0 / (${RRF_K} + l.rank), 0) AS score
      FROM semantic s
      FULL OUTER JOIN lexical l ON s.id = l.id
    )
    SELECT
      scoped.id AS chunk_id,
      scoped.source_id,
      sources.title AS source_title,
      scoped.content,
      scoped.start_char,
      scoped.segment_label,
      fused.score
    FROM fused
    JOIN scoped ON scoped.id = fused.id
    JOIN sources ON sources.id = scoped.source_id
    ORDER BY fused.score DESC
    LIMIT ${limit}
  `);

  return result.rows.map((row) => ({
    chunkId: row.chunk_id,
    sourceId: row.source_id,
    sourceTitle: row.source_title,
    content: row.content,
    startChar: Number(row.start_char),
    segmentLabel: row.segment_label,
    score: Number(row.score),
  }));
}
