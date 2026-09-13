"use client";

import { useT } from "@/lib/i18n/context";
import type { HighlightTarget, StoredCitation } from "@/lib/types";

/** The sources behind an answer, each opening the reader at its passage. */
export function CitationList({
  citations,
  onCitationClick,
}: {
  citations: StoredCitation[];
  onCitationClick: (target: HighlightTarget) => void;
}) {
  const t = useT();
  if (citations.length === 0) return null;

  return (
    <div className="mt-4 rounded-lg border border-border bg-surface-2/60 p-2">
      <p className="mb-1 px-1.5 text-[10px] font-semibold tracking-wider text-fg-subtle uppercase">
        {t.chat.citationsLabel}
      </p>
      <ul>
        {citations.map((citation) => (
          <li key={citation.index}>
            <button
              onClick={() =>
                onCitationClick({
                  sourceId: citation.sourceId,
                  startChar: citation.startChar,
                  endChar: citation.endChar,
                })
              }
              className="flex w-full items-baseline gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-surface"
            >
              <span className="flex size-4 shrink-0 items-center justify-center rounded bg-accent-soft text-[10px] font-bold text-accent">
                {citation.index}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">
                  {citation.sourceTitle}
                  {citation.segmentLabel && (
                    <span className="ml-1.5 font-normal text-fg-subtle">
                      {citation.segmentLabel}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 line-clamp-2 text-xs leading-snug text-fg-muted italic">
                  “{citation.quote.trim()}”
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
