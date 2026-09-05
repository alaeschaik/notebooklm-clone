"use client";

import { ExternalLink, X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import useSWR from "swr";

import { SourceIcon } from "@/components/sources/source-icon";
import { Spinner } from "@/components/ui/spinner";
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
}: {
  target: HighlightTarget;
  onClose: () => void;
}) {
  const t = useT();
  const { data, isLoading } = useSWR<{ source: SourceDetail }>(
    `/api/sources/${target.sourceId}`,
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

  // Re-run when the range changes, not just on mount: clicking a second
  // citation in an already-open source must move the view to the new passage.
  useEffect(() => {
    markRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [target.startChar, target.endChar, text]);

  return (
    <>
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <button
          onClick={onClose}
          aria-label={t.sources.viewer.close}
          className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <X className="size-4" />
        </button>
        {source && (
          <>
            <SourceIcon kind={source.kind} className="size-3.5 shrink-0 text-fg-subtle" />
            <h2 className="truncate text-sm font-semibold">{source.title}</h2>
            {source.url && (
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={t.sources.viewer.openOriginal}
                className="ml-auto rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
              >
                <ExternalLink className="size-3.5" />
              </a>
            )}
          </>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : (
          <div className="space-y-5">
            {blocks.map((block, index) => {
              const blockText = text.slice(block.start, block.end);

              // Clip the highlight to this block; a citation can span a page
              // boundary, in which case it is marked in both.
              const from = Math.max(target.startChar, block.start);
              const to = Math.min(target.endChar, block.end);
              const marked = hasHighlight && from < to;

              return (
                <div key={index}>
                  {block.label && (
                    <div className="mb-1.5 text-[11px] font-medium tracking-wide text-fg-subtle uppercase">
                      {block.label}
                    </div>
                  )}
                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-fg">
                    {marked ? (
                      <>
                        {text.slice(block.start, from)}
                        <mark
                          ref={markRef}
                          className="rounded bg-highlight px-0.5 text-fg"
                        >
                          {text.slice(from, to)}
                        </mark>
                        {text.slice(to, block.end)}
                      </>
                    ) : (
                      blockText
                    )}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
