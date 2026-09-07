"use client";

import { Sparkles } from "lucide-react";

import { AudioOverviewCard } from "@/components/studio/audio-overview";
import { MindMapCard } from "@/components/studio/mind-map";
import { NotesCard } from "@/components/studio/notes";
import { StudioDocs } from "@/components/studio/studio-docs";
import { Panel, PanelBody, EmptyState } from "@/components/ui/panel";
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
    <Panel title={t.studio.title}>
      <PanelBody className="p-3">
        {!hasReadySource ? (
          <EmptyState
            icon={<Sparkles className="size-5" />}
            title={t.studio.title}
            description={t.studio.needsSources}
          />
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
      </PanelBody>
    </Panel>
  );
}
