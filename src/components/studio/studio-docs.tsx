"use client";

import { AlertCircle, FileText, Trash2 } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";

import { Answer } from "@/components/chat/answer";
import { StudioCard } from "@/components/studio/studio-card";
import { IconButton } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { fetcher } from "@/hooks/use-api";
import { useT } from "@/lib/i18n/context";
import type { CitationMarker, HighlightTarget, StoredCitation } from "@/lib/types";

type StudioKind = "briefing" | "study_guide" | "faq" | "timeline";

type Doc = {
  id: string;
  kind: StudioKind | "summary";
  title: string;
  content: string;
  citations: StoredCitation[] | null;
  markers: CitationMarker[] | null;
  status: "pending" | "running" | "ready" | "failed";
  error: string | null;
};

const KINDS: StudioKind[] = ["briefing", "study_guide", "faq", "timeline"];

export function StudioDocs({
  notebookId,
  selectedIds,
  disabled,
  onCitationClick,
}: {
  notebookId: string;
  selectedIds: string[];
  disabled: boolean;
  onCitationClick: (target: HighlightTarget) => void;
}) {
  const t = useT();
  const [openDoc, setOpenDoc] = useState<Doc | null>(null);
  const [starting, setStarting] = useState<StudioKind | null>(null);

  const { data, mutate } = useSWR<{ docs: Doc[] }>(
    `/api/notebooks/${notebookId}/studio`,
    fetcher,
    {
      refreshInterval: (latest) =>
        latest?.docs.some((doc) => doc.status === "running" || doc.status === "pending")
          ? 2000
          : 0,
    },
  );

  const docs = data?.docs ?? [];

  async function generate(kind: StudioKind) {
    setStarting(kind);
    try {
      await fetch(`/api/notebooks/${notebookId}/studio`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, sourceIds: selectedIds, title: t.studio.kinds[kind] }),
      });
      await mutate();
    } finally {
      setStarting(null);
    }
  }

  async function remove(docId: string) {
    await fetch(`/api/notebooks/${notebookId}/studio?docId=${docId}`, {
      method: "DELETE",
    });
    await mutate();
  }

  return (
    <StudioCard icon={<FileText className="size-3.5" />} title={t.studio.docs}>
      <div className="mt-2.5 grid grid-cols-2 gap-1.5">
        {KINDS.map((kind) => (
          <button
            key={kind}
            onClick={() => generate(kind)}
            disabled={disabled || starting !== null}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2 py-2 text-xs font-medium transition-colors hover:border-accent-border hover:bg-accent-soft hover:text-accent disabled:pointer-events-none disabled:opacity-45"
          >
            {starting === kind && <Spinner className="size-3" />}
            {t.studio.kinds[kind]}
          </button>
        ))}
      </div>

      {docs.length > 0 && (
        <ul className="mt-2.5 space-y-0.5 border-t border-border pt-2">
          {docs.map((doc) => (
            <li key={doc.id} className="group flex items-center gap-1.5">
              <button
                onClick={() => doc.status === "ready" && setOpenDoc(doc)}
                disabled={doc.status !== "ready"}
                className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-surface-2 disabled:cursor-default"
              >
                {doc.status === "running" || doc.status === "pending" ? (
                  <Spinner className="size-3 shrink-0" />
                ) : doc.status === "failed" ? (
                  <AlertCircle className="size-3 shrink-0 text-danger" />
                ) : (
                  <FileText className="size-3 shrink-0 text-fg-subtle" />
                )}
                <span className="truncate text-xs font-medium">{doc.title}</span>
              </button>
              <IconButton
                title={t.common.delete}
                size="icon-sm"
                onClick={() => remove(doc.id)}
                className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:bg-danger-soft hover:text-danger"
              >
                <Trash2 className="size-3" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={openDoc !== null}
        onClose={() => setOpenDoc(null)}
        title={openDoc?.title ?? ""}
        className="w-[min(48rem,calc(100vw-2rem))]"
      >
        {openDoc && (
          <div className="max-h-[70vh] overflow-y-auto">
            <Answer
              content={openDoc.content}
              citations={openDoc.citations ?? []}
              markers={openDoc.markers ?? []}
              onCitationClick={(target) => {
                // The reader lives behind this dialog, so it has to close for
                // the highlight to be visible.
                setOpenDoc(null);
                onCitationClick(target);
              }}
            />
          </div>
        )}
      </Dialog>
    </StudioCard>
  );
}
