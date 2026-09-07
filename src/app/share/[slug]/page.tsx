import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { SharedNotebook } from "@/components/shared-notebook";
import { getDb } from "@/lib/db";
import { messages, notebooks, sources } from "@/lib/db/schema";
import type { Source, StoredMessage } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Shared notebooks are unlisted, not indexed. */
export const metadata = { robots: { index: false, follow: false } };

export default async function SharedPage(props: PageProps<"/share/[slug]">) {
  const { slug } = await props.params;
  const db = getDb();

  const [notebook] = await db
    .select()
    .from(notebooks)
    .where(eq(notebooks.publicSlug, slug));

  if (!notebook) notFound();

  const [sourceRows, messageRows] = await Promise.all([
    db
      .select({
        id: sources.id,
        kind: sources.kind,
        title: sources.title,
        url: sources.url,
        status: sources.status,
        error: sources.error,
        charCount: sources.charCount,
        tokenEstimate: sources.tokenEstimate,
        createdAt: sources.createdAt,
      })
      .from(sources)
      .where(eq(sources.notebookId, notebook.id))
      .orderBy(asc(sources.createdAt)),
    db
      .select()
      .from(messages)
      .where(eq(messages.notebookId, notebook.id))
      .orderBy(asc(messages.createdAt)),
  ]);

  const notebookSources: Source[] = sourceRows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
  }));

  const conversation: StoredMessage[] = messageRows.map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
    citations: row.citations,
    markers: row.markers,
    createdAt: row.createdAt.toISOString(),
  }));

  return (
    <SharedNotebook
      slug={slug}
      title={notebook.title}
      emoji={notebook.emoji}
      sources={notebookSources}
      messages={conversation}
    />
  );
}
