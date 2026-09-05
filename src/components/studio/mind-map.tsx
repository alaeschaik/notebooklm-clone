"use client";

import { ChevronRight, Network, Sparkles } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { fetcher } from "@/hooks/use-api";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/context";
import type { MindMapNode } from "@/lib/db/schema";

type MindMap = {
  status: "pending" | "running" | "ready" | "failed";
  error: string | null;
  data: MindMapNode | null;
};

/**
 * An expandable tree rather than a force-directed graph. A graph looks
 * impressive in a screenshot but is hard to read at this width and hides the
 * hierarchy the model actually produced; a tree shows it directly and each
 * node stays clickable as a question.
 */
function Node({
  node,
  depth,
  onAsk,
}: {
  node: MindMapNode;
  depth: number;
  onAsk: (label: string) => void;
}) {
  const [open, setOpen] = useState(depth < 1);
  const children = node.children ?? [];

  return (
    <li>
      <div
        className="group flex items-start gap-1.5 rounded-md py-1"
        style={{ paddingLeft: `${depth * 0.75}rem` }}
      >
        {children.length > 0 ? (
          <button
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="mt-0.5 rounded p-0.5 text-fg-subtle hover:bg-surface-2 hover:text-fg"
          >
            <ChevronRight
              className={cn("size-3 transition-transform", open && "rotate-90")}
            />
          </button>
        ) : (
          <span className="mt-1.5 ml-1.5 size-1 shrink-0 rounded-full bg-border-strong" />
        )}

        <div className="min-w-0 flex-1">
          <button
            onClick={() => onAsk(node.label)}
            className={cn(
              "text-left hover:text-accent hover:underline",
              depth === 0 ? "text-sm font-semibold" : "text-[13px] font-medium",
            )}
          >
            {node.label}
          </button>
          {node.summary && (
            <p className="text-xs leading-snug text-fg-muted">{node.summary}</p>
          )}
        </div>
      </div>

      {open && children.length > 0 && (
        <ul className="border-l border-border" style={{ marginLeft: `${depth * 0.75 + 0.55}rem` }}>
          {children.map((child, index) => (
            <Node key={index} node={child} depth={depth + 1} onAsk={onAsk} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function MindMapCard({
  notebookId,
  selectedIds,
  disabled,
  onAsk,
}: {
  notebookId: string;
  selectedIds: string[];
  disabled: boolean;
  onAsk: (question: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);

  const { data, mutate } = useSWR<{ mindMap: MindMap | null }>(
    `/api/notebooks/${notebookId}/mindmap`,
    fetcher,
    {
      refreshInterval: (latest) =>
        latest?.mindMap?.status === "running" ? 2000 : 0,
    },
  );

  const map = data?.mindMap ?? null;
  const running = map?.status === "running" || map?.status === "pending";

  async function generate() {
    setStarting(true);
    try {
      await fetch(`/api/notebooks/${notebookId}/mindmap`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceIds: selectedIds }),
      });
      await mutate();
    } finally {
      setStarting(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface-2 p-3">
      <div className="flex items-center gap-2">
        <Network className="size-4 text-accent" />
        <h3 className="text-[13px] font-semibold">{t.studio.mindMap}</h3>
      </div>

      {map?.status === "ready" && map.data ? (
        <div className="mt-2 flex items-center gap-2">
          <Button size="sm" className="flex-1" onClick={() => setOpen(true)}>
            {t.studio.mindMap}
          </Button>
          <button
            onClick={generate}
            className="text-xs text-fg-subtle hover:text-fg"
          >
            {t.common.regenerate}
          </button>
        </div>
      ) : running ? (
        <p className="mt-2 flex items-center gap-2 text-xs text-fg-muted">
          <Spinner className="size-3" />
          {t.common.loading}
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs text-fg-subtle">{t.studio.mindMapHint}</p>
          {map?.status === "failed" && (
            <p className="mt-1.5 text-xs text-danger">{map.error}</p>
          )}
          <Button
            size="sm"
            className="mt-2.5 w-full"
            onClick={generate}
            disabled={disabled || starting}
          >
            {starting ? <Spinner /> : <Sparkles className="size-3.5" />}
            {t.common.generate}
          </Button>
        </>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t.studio.mindMap}
        className="w-[min(46rem,calc(100vw-2rem))]"
      >
        {map?.data && (
          <ul className="max-h-[65vh] overflow-y-auto">
            <Node
              node={map.data}
              depth={0}
              onAsk={(label) => {
                setOpen(false);
                onAsk(label);
              }}
            />
          </ul>
        )}
      </Dialog>
    </section>
  );
}
