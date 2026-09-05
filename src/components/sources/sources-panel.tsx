"use client";

import { AlertCircle, Check, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { AddSourceDialog } from "@/components/sources/add-source-dialog";
import { SourceIcon } from "@/components/sources/source-icon";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/cn";
import type { Source } from "@/lib/types";

export function SourcesPanel({
  notebookId,
  sources,
  selected,
  onToggle,
  onToggleAll,
  onOpen,
  onChanged,
}: {
  notebookId: string;
  sources: Source[];
  selected: string[];
  onToggle: (id: string) => void;
  onToggleAll: (on: boolean) => void;
  onOpen: (id: string) => void;
  onChanged: () => void;
}) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const ready = sources.filter((source) => source.status === "ready");
  const allSelected = ready.length > 0 && selected.length === ready.length;

  async function remove(id: string) {
    if (!confirm(t.sources.deleteConfirm)) return;
    setRemoving(id);
    try {
      await fetch(`/api/sources/${id}`, { method: "DELETE" });
      onChanged();
    } finally {
      setRemoving(null);
    }
  }

  return (
    <>
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
        <h2 className="text-sm font-semibold">{t.sources.title}</h2>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="size-3.5" />
          {t.common.add}
        </Button>
      </div>

      {ready.length > 0 && (
        <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
          <span className="text-xs text-fg-subtle">
            {t.sources.selectedCount(selected.length, ready.length)}
          </span>
          <button
            onClick={() => onToggleAll(!allSelected)}
            className="text-xs font-medium text-accent hover:underline"
          >
            {allSelected ? t.sources.deselectAll : t.sources.selectAll}
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {sources.length === 0 ? (
          <p className="px-3 py-10 text-center text-sm text-fg-subtle">
            {t.sources.empty}
          </p>
        ) : (
          <ul className="space-y-1">
            {sources.map((source) => {
              const isReady = source.status === "ready";
              const isSelected = selected.includes(source.id);

              return (
                <li key={source.id} className="group relative">
                  <div
                    className={cn(
                      "flex items-start gap-2.5 rounded-lg border px-2.5 py-2 transition-colors",
                      isSelected
                        ? "border-accent-border bg-accent-soft"
                        : "border-transparent hover:bg-surface-2",
                    )}
                  >
                    <button
                      onClick={() => isReady && onToggle(source.id)}
                      disabled={!isReady}
                      aria-label={source.title}
                      aria-pressed={isSelected}
                      className={cn(
                        "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                        isSelected
                          ? "border-accent bg-accent text-accent-fg"
                          : "border-border-strong bg-surface",
                        !isReady && "opacity-40",
                      )}
                    >
                      {isSelected && <Check className="size-3" strokeWidth={3} />}
                    </button>

                    <button
                      onClick={() => isReady && onOpen(source.id)}
                      disabled={!isReady}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="flex items-center gap-1.5">
                        <SourceIcon
                          kind={source.kind}
                          className="size-3.5 shrink-0 text-fg-subtle"
                        />
                        <span className="truncate text-[13px] font-medium">
                          {source.title}
                        </span>
                      </span>

                      {source.status === "failed" ? (
                        <span className="mt-1 flex items-start gap-1 text-xs text-danger">
                          <AlertCircle className="mt-px size-3 shrink-0" />
                          <span className="line-clamp-3">{source.error}</span>
                        </span>
                      ) : isReady ? null : (
                        <span className="mt-1 flex items-center gap-1.5 text-xs text-fg-subtle">
                          <Spinner className="size-3" />
                          {t.sources.status[source.status]}
                        </span>
                      )}
                    </button>

                    <button
                      onClick={() => remove(source.id)}
                      aria-label={t.common.delete}
                      className="rounded p-1 text-fg-subtle opacity-0 transition group-hover:opacity-100 hover:bg-danger-soft hover:text-danger focus-visible:opacity-100"
                    >
                      {removing === source.id ? (
                        <Spinner className="size-3" />
                      ) : (
                        <Trash2 className="size-3" />
                      )}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <AddSourceDialog
        notebookId={notebookId}
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={onChanged}
      />
    </>
  );
}
