"use client";

import { Sparkles } from "lucide-react";
import useSWR from "swr";

import { Skeleton } from "@/components/ui/panel";
import { useT } from "@/lib/i18n/context";

async function postSuggestions([url, ids]: [string, string]): Promise<{
  questions: string[];
}> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sourceIds: ids.split(",") }),
  });
  if (!response.ok) return { questions: [] };
  return (await response.json()) as { questions: string[] };
}

export function Suggestions({
  notebookId,
  sourceIds,
  onPick,
}: {
  notebookId: string;
  sourceIds: string[];
  onPick: (question: string) => void;
}) {
  const t = useT();
  // Keyed on the selected sources so changing the selection re-asks, and
  // revalidation is off so simply focusing the tab does not re-bill a request.
  const { data, isLoading } = useSWR(
    sourceIds.length > 0
      ? ([`/api/notebooks/${notebookId}/suggestions`, [...sourceIds].sort().join(",")] as const)
      : null,
    postSuggestions,
    { revalidateOnFocus: false, revalidateIfStale: false, keepPreviousData: true },
  );

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  const questions = data?.questions ?? [];
  if (questions.length === 0) return null;

  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-fg-subtle uppercase">
        <Sparkles className="size-3" />
        {t.chat.suggestions}
      </p>
      <ul className="space-y-1.5">
        {questions.map((question) => (
          <li key={question}>
            <button
              onClick={() => onPick(question)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-left text-[13px] leading-snug shadow-sm transition-[border-color,background-color] hover:border-accent-border hover:bg-accent-soft"
            >
              {question}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
