"use client";

import { AudioOverviewCard } from "@/components/studio/audio-overview";
import { MindMapCard } from "@/components/studio/mind-map";
import { NotesCard } from "@/components/studio/notes";
import { StudioDocs } from "@/components/studio/studio-docs";
import { useT } from "@/lib/i18n/context";
import type { HighlightTarget, Source } from "@/lib/types";

export function StudioPanel({
  notebookId,
  sources,
  selectedIds,
  onCitationClick,
  onAsk,
}: {
  notebookId: string;
  sources: Source[];
  selectedIds: string[];
  onCitationClick: (target: HighlightTarget) => void;
  onAsk: (question: string) => void;
}) {
  const t = useT();
  const hasReadySource = sources.some((source) => source.status === "ready");
  const disabled = !hasReadySource || selectedIds.length === 0;

  return (
    <>
      <div className="flex h-12 shrink-0 items-center border-b border-border px-3">
        <h2 className="text-sm font-semibold">{t.studio.title}</h2>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {!hasReadySource ? (
          <p className="py-10 text-center text-sm text-fg-subtle">
            {t.studio.needsSources}
          </p>
        ) : (
          <div className="space-y-3">
            <AudioOverviewCard
              notebookId={notebookId}
              selectedIds={selectedIds}
              disabled={disabled}
            />
            <StudioDocs
              notebookId={notebookId}
              selectedIds={selectedIds}
              disabled={disabled}
              onCitationClick={onCitationClick}
            />
            <MindMapCard
              notebookId={notebookId}
              selectedIds={selectedIds}
              disabled={disabled}
              onAsk={onAsk}
            />
            <NotesCard
              notebookId={notebookId}
              onCitationClick={onCitationClick}
            />
          </div>
        )}
      </div>
    </>
  );
}
