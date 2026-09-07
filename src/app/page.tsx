import { count, desc, eq } from "drizzle-orm";

import { LocaleSwitcher } from "@/components/locale-switcher";
import { NotebookGrid } from "@/components/notebook-grid";
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
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-6">
          <span
            aria-hidden
            className="flex size-6 items-center justify-center rounded-md bg-accent text-[11px] font-bold text-accent-fg"
          >
            N
          </span>
          <span className="text-sm font-semibold tracking-tight">{t.appName}</span>
          <div className="ml-auto">
            <LocaleSwitcher />
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
        <h1 className="text-[28px] leading-tight font-semibold tracking-tight">
          {t.home.heading}
        </h1>
        <p className="mt-2 max-w-lg text-sm leading-relaxed text-fg-muted">
          {t.home.subheading}
        </p>

        <div className="mt-8">
          <NotebookGrid initial={items} />
        </div>
      </div>
    </div>
  );
}
