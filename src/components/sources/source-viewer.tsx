"use client";

import { ArrowLeft, ExternalLink } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import useSWR from "swr";

import { SourceIcon } from "@/components/sources/source-icon";
import { IconButton } from "@/components/ui/button";
import { Panel, PanelBody, Skeleton } from "@/components/ui/panel";
import { fetcher } from "@/hooks/use-api";
import { useT } from "@/lib/i18n/context";
import type { HighlightTarget, SourceDetail, SourceSegment } from "@/lib/types";

type Block = { label: string | null; start: number; end: number };

/** Splits the text into labelled blocks, or one unlabelled block. */
function toBlocks(text: string, segments: SourceSegment[] | null): Block[] {
  if (!segments?.length) return [{ label: null, start: 0, end: text.length }];
  return segments.map((segment) => ({
    label: segment.label,
    start: segment.start,
    end: segment.end,
  }));
}

export function SourceViewer({
  target,
  onClose,
  /** Overridden by shared notebooks, which are read through the share slug
   * rather than the owner-scoped source route. */
  resolveUrl = (sourceId) => `/api/sources/${sourceId}`,
}: {
  target: HighlightTarget;
  onClose: () => void;
  resolveUrl?: (sourceId: string) => string;
}) {
  const t = useT();
  const { data, isLoading } = useSWR<{ source: SourceDetail }>(
    resolveUrl(target.sourceId),
    fetcher,
  );
  const markRef = useRef<HTMLElement>(null);
  const source = data?.source;
  const text = source?.fullText ?? "";

  const hasHighlight = target.endChar > target.startChar;
  const blocks = useMemo(
    () => toBlocks(text, source?.pageMap ?? null),
    [text, source?.pageMap],
  );

  // Re-runs when the range changes, not only on mount: clicking a second
  // citation in an already-open source must move to the new passage.
  useEffect(() => {
    markRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [target.startChar, target.endChar, text]);

  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          {source && (
            <SourceIcon
              kind={source.kind}
              className="size-3.5 shrink-0 text-fg-subtle"
            />
          )}
          <span className="truncate">{source?.title ?? t.common.loading}</span>
        </span>
      }
      actions={
        <>
          {source?.url && (
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer noopener"
              title={t.sources.viewer.openOriginal}
              aria-label={t.sources.viewer.openOriginal}
              className="flex size-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <ExternalLink className="size-3.5" />
            </a>
          )}
          <IconButton
            title={t.sources.viewer.close}
            size="icon-sm"
            onClick={onClose}
          >
            <ArrowLeft className="size-4" />
          </IconButton>
        </>
      }
    >
      <PanelBody className="px-5 py-4">
        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className={i % 3 === 2 ? "h-4 w-2/3" : "h-4 w-full"} />
            ))}
          </div>
        ) : (
          <div className="space-y-5">
            {blocks.map((block, index) => {
              // Clip the highlight to this block: a citation can span a page
              // boundary, in which case it is marked in both.
              const from = Math.max(target.startChar, block.start);
              const to = Math.min(target.endChar, block.end);
              const marked = hasHighlight && from < to;

              return (
                <div key={index}>
                  {block.label && (
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="text-[10px] font-semibold tracking-wider text-fg-subtle uppercase">
                        {block.label}
                      </span>
                      <span className="h-px flex-1 bg-border" />
                    </div>
                  )}
                  <p className="text-[13px] leading-[1.75] whitespace-pre-wrap text-fg-muted">
                    {marked ? (
                      <>
                        {text.slice(block.start, from)}
                        <mark
                          ref={markRef}
                          className="rounded-sm bg-highlight px-0.5 py-px text-fg ring-1 ring-highlight-ring"
                        >
                          {text.slice(from, to)}
                        </mark>
                        {text.slice(to, block.end)}
                      </>
                    ) : (
                      text.slice(block.start, block.end)
                    )}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}
