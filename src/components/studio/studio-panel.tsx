"use client";

import { useT } from "@/lib/i18n/context";
import type { Source } from "@/lib/types";

export function StudioPanel({
  sources,
}: {
  notebookId: string;
  sources: Source[];
  selectedIds: string[];
}) {
  const t = useT();
  const hasReadySource = sources.some((source) => source.status === "ready");

  return (
    <>
      <div className="flex h-12 shrink-0 items-center border-b border-border px-3">
        <h2 className="text-sm font-semibold">{t.studio.title}</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {!hasReadySource && (
          <p className="py-10 text-center text-sm text-fg-subtle">
            {t.studio.needsSources}
          </p>
        )}
      </div>
    </>
  );
}
