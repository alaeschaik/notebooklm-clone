import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { NotebookWorkspace } from "@/components/notebook-workspace";
import { getDb } from "@/lib/db";
import { notebooks } from "@/lib/db/schema";
import { getVisitorId } from "@/lib/session-server";

export const dynamic = "force-dynamic";

export default async function NotebookPage(
  props: PageProps<"/notebook/[id]">,
) {
  const { id } = await props.params;
  const visitorId = await getVisitorId();
  if (!visitorId) notFound();

  const [notebook] = await getDb()
    .select()
    .from(notebooks)
    .where(and(eq(notebooks.id, id), eq(notebooks.ownerId, visitorId)));

  if (!notebook) notFound();

  return (
    <NotebookWorkspace
      notebookId={notebook.id}
      title={notebook.title}
      emoji={notebook.emoji}
    />
  );
}
