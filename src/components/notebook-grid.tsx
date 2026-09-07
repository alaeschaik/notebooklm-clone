"use client";

import { FileText, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { NotebookSummary } from "@/app/page";
import { Button, IconButton } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { EmptyState } from "@/components/ui/panel";
import { Spinner } from "@/components/ui/spinner";
import { useLocale, useT } from "@/lib/i18n/context";

export function NotebookGrid({ initial }: { initial: NotebookSummary[] }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const confirm = useConfirm();
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
        body: JSON.stringify({ title: t.home.untitled }),
      });
      const data = (await response.json()) as { notebook?: { id: string } };
      if (data.notebook) router.push(`/notebook/${data.notebook.id}`);
    } finally {
      setCreating(false);
    }
  }

  async function remove(id: string) {
    const ok = await confirm({
      title: t.confirm.deleteNotebook.title,
      message: t.confirm.deleteNotebook.message,
      confirmLabel: t.confirm.deleteNotebook.action,
      cancelLabel: t.common.cancel,
      destructive: true,
    });
    if (!ok) return;

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
      <Button variant="primary" onClick={create} disabled={creating}>
        {creating ? <Spinner /> : <Plus className="size-4" />}
        {t.home.create}
      </Button>

      {initial.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-border-strong bg-surface/50">
          <EmptyState
            icon={<FileText className="size-5" />}
            title={t.home.empty}
            description={t.home.subheading}
          />
        </div>
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {initial.map((notebook) => (
            <li key={notebook.id} className="group relative">
              <Link
                href={`/notebook/${notebook.id}`}
                className="flex h-full min-h-[9.5rem] flex-col rounded-xl border border-border bg-surface p-4 shadow-sm transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-border-strong hover:shadow-md"
              >
                <span aria-hidden className="text-[26px] leading-none">
                  {notebook.emoji}
                </span>
                <span className="mt-3 line-clamp-2 pr-6 text-sm font-medium leading-snug">
                  {notebook.title}
                </span>
                <span className="mt-auto pt-4 text-xs text-fg-subtle">
                  {t.home.sourceCount(notebook.sourceCount)}
                  <span className="mx-1.5 opacity-50">·</span>
                  {formatter.format(new Date(notebook.updatedAt))}
                </span>
              </Link>

              <IconButton
                title={t.common.delete}
                size="icon-sm"
                onClick={() => remove(notebook.id)}
                className="absolute top-3 right-3 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:bg-danger-soft hover:text-danger"
              >
                {deleting === notebook.id ? (
                  <Spinner className="size-3.5" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
