"use client";

import { AlertCircle, Check, Library, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { AddSourceDialog } from "@/components/sources/add-source-dialog";
import { SourceIcon } from "@/components/sources/source-icon";
import { Button, IconButton } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { EmptyState, Panel, PanelBody } from "@/components/ui/panel";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/context";
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
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const ready = sources.filter((source) => source.status === "ready");
  const allSelected = ready.length > 0 && selected.length === ready.length;

  async function remove(id: string) {
    const ok = await confirm({
      title: t.confirm.deleteSource.title,
      message: t.confirm.deleteSource.message,
      confirmLabel: t.confirm.deleteSource.action,
      cancelLabel: t.common.cancel,
      destructive: true,
    });
    if (!ok) return;

    setRemoving(id);
    try {
      await fetch(`/api/sources/${id}`, { method: "DELETE" });
      onChanged();
    } finally {
      setRemoving(null);
    }
  }

  return (
    <Panel
      title={t.sources.title}
      actions={
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="size-3.5" />
          {t.common.add}
        </Button>
      }
    >
      {ready.length > 0 && (
        <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
          <span className="text-xs tabular-nums text-fg-subtle">
            {t.sources.selectedCount(selected.length, ready.length)}
          </span>
          <button
            onClick={() => onToggleAll(!allSelected)}
            className="rounded px-1 text-xs font-medium text-accent hover:underline"
          >
            {allSelected ? t.sources.deselectAll : t.sources.selectAll}
          </button>
        </div>
      )}

      <PanelBody className="p-2">
        {sources.length === 0 ? (
          <EmptyState
            icon={<Library className="size-5" />}
            title={t.sources.title}
            description={t.sources.empty}
            action={
              <Button size="sm" variant="primary" onClick={() => setAdding(true)}>
                <Plus className="size-3.5" />
                {t.sources.add}
              </Button>
            }
          />
        ) : (
          <ul className="space-y-0.5">
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
                      role="checkbox"
                      aria-checked={isSelected}
                      aria-label={source.title}
                      className={cn(
                        "mt-px flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                        isSelected
                          ? "border-accent bg-accent text-accent-fg"
                          : "border-border-strong bg-surface hover:border-accent",
                        !isReady && "opacity-40",
                      )}
                    >
                      {isSelected && <Check className="size-3" strokeWidth={3} />}
                    </button>

                    <button
                      onClick={() => isReady && onOpen(source.id)}
                      disabled={!isReady}
                      className="min-w-0 flex-1 text-left disabled:cursor-default"
                    >
                      <span className="flex items-center gap-1.5">
                        <SourceIcon
                          kind={source.kind}
                          className="size-3.5 shrink-0 text-fg-subtle"
                        />
                        <span className="truncate text-[13px] leading-5 font-medium">
                          {source.title}
                        </span>
                      </span>

                      {source.status === "failed" ? (
                        <span className="mt-1 flex items-start gap-1.5 rounded-md bg-danger-soft px-1.5 py-1 text-xs leading-snug text-danger">
                          <AlertCircle className="mt-0.5 size-3 shrink-0" />
                          <span className="line-clamp-4">{source.error}</span>
                        </span>
                      ) : isReady ? null : (
                        <span className="mt-1 flex items-center gap-1.5 text-xs text-fg-subtle">
                          <Spinner className="size-3" />
                          {t.sources.status[source.status]}
                        </span>
                      )}
                    </button>

                    <IconButton
                      title={t.common.delete}
                      size="icon-sm"
                      onClick={() => remove(source.id)}
                      className="-mr-1 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:bg-danger-soft hover:text-danger"
                    >
                      {removing === source.id ? (
                        <Spinner className="size-3" />
                      ) : (
                        <Trash2 className="size-3" />
                      )}
                    </IconButton>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </PanelBody>

      <AddSourceDialog
        notebookId={notebookId}
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={onChanged}
      />
    </Panel>
  );
}
