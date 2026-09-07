import { and, asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { NotebookWorkspace } from "@/components/notebook-workspace";
import { getDb } from "@/lib/db";
import { messages, notebooks, sources } from "@/lib/db/schema";
import { getOrigin } from "@/lib/origin";
import { getVisitorId } from "@/lib/session-server";
import type { Source, StoredMessage } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NotebookPage(
  props: PageProps<"/notebook/[id]">,
) {
  const { id } = await props.params;
  const visitorId = await getVisitorId();
  if (!visitorId) notFound();

  const db = getDb();
  const [notebook] = await db
    .select()
    .from(notebooks)
    .where(and(eq(notebooks.id, id), eq(notebooks.ownerId, visitorId)));

  if (!notebook) notFound();

  // Fetched here rather than left to the client so the first paint already has
  // the notebook's contents. Loading them client-side means every visit flashes
  // an empty state before the real one arrives.
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

  const initialSources: Source[] = sourceRows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
  }));

  const initialMessages: StoredMessage[] = messageRows.map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
    citations: row.citations,
    markers: row.markers,
    createdAt: row.createdAt.toISOString(),
  }));

  return (
    <NotebookWorkspace
      notebookId={notebook.id}
      title={notebook.title}
      emoji={notebook.emoji}
      publicSlug={notebook.publicSlug}
      origin={await getOrigin()}
      initialSources={initialSources}
      initialMessages={initialMessages}
    />
  );
}
