"use client";

import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { NotebookSummary } from "@/app/page";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useLocale } from "@/lib/i18n/context";
import { useT } from "@/lib/i18n/context";

export function NotebookGrid({ initial }: { initial: NotebookSummary[] }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const formatter = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  async function create() {
    setCreating(true);
    try {
      const response = await fetch("/api/notebooks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "" }),
      });
      const data = (await response.json()) as { notebook?: { id: string } };
      if (data.notebook) router.push(`/notebook/${data.notebook.id}`);
    } finally {
      setCreating(false);
    }
  }

  async function remove(id: string) {
    if (!confirm(t.home.deleteConfirm)) return;
    setDeleting(id);
    try {
      await fetch(`/api/notebooks/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setDeleting(null);
    }
  }

  return (
    <>
      <div className="mb-6">
        <Button variant="primary" onClick={create} disabled={creating}>
          {creating ? <Spinner /> : <Plus className="size-4" />}
          {t.home.create}
        </Button>
      </div>

      {initial.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong px-6 py-16 text-center text-sm text-fg-subtle">
          {t.home.empty}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {initial.map((notebook) => (
            <li key={notebook.id} className="group relative">
              <Link
                href={`/notebook/${notebook.id}`}
                className="flex h-full flex-col rounded-xl border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-2"
              >
                <span className="text-2xl leading-none">{notebook.emoji}</span>
                <span className="mt-3 line-clamp-2 font-medium">
                  {notebook.title}
                </span>
                <span className="mt-auto pt-3 text-xs text-fg-subtle">
                  {t.home.sourceCount(notebook.sourceCount)} ·{" "}
                  {formatter.format(new Date(notebook.updatedAt))}
                </span>
              </Link>
              <button
                onClick={() => remove(notebook.id)}
                aria-label={t.common.delete}
                className="absolute top-3 right-3 rounded-md p-1.5 text-fg-subtle opacity-0 transition group-hover:opacity-100 hover:bg-danger-soft hover:text-danger focus-visible:opacity-100"
              >
                {deleting === notebook.id ? (
                  <Spinner className="size-3.5" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
