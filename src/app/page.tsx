import { count, desc, eq } from "drizzle-orm";

import { NotebookGrid } from "@/components/notebook-grid";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { getDb } from "@/lib/db";
import { notebooks, sources } from "@/lib/db/schema";
import { getDictionary } from "@/lib/i18n/server";
import { getVisitorId } from "@/lib/session-server";

export const dynamic = "force-dynamic";

export type NotebookSummary = {
  id: string;
  title: string;
  emoji: string;
  updatedAt: string;
  sourceCount: number;
};

async function listNotebooks(visitorId: string): Promise<NotebookSummary[]> {
  const rows = await getDb()
    .select({
      id: notebooks.id,
      title: notebooks.title,
      emoji: notebooks.emoji,
      updatedAt: notebooks.updatedAt,
      sourceCount: count(sources.id),
    })
    .from(notebooks)
    .leftJoin(sources, eq(sources.notebookId, notebooks.id))
    .where(eq(notebooks.ownerId, visitorId))
    .groupBy(notebooks.id)
    .orderBy(desc(notebooks.updatedAt));

  return rows.map((row) => ({
    ...row,
    updatedAt: row.updatedAt.toISOString(),
    sourceCount: Number(row.sourceCount),
  }));
}

export default async function Home() {
  const t = await getDictionary();
  const visitorId = await getVisitorId();
  const items = visitorId ? await listNotebooks(visitorId) : [];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-10">
      <header className="mb-10 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t.home.heading}
          </h1>
          <p className="mt-1.5 max-w-xl text-sm text-fg-muted">
            {t.home.subheading}
          </p>
        </div>
        <LocaleSwitcher />
      </header>

      <NotebookGrid initial={items} />
    </div>
  );
}
