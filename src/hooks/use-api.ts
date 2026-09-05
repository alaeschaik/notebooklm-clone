"use client";

import useSWR, { type SWRConfiguration } from "swr";

import type { Source } from "@/lib/types";
import type { StoredMessage } from "@/lib/types";

export async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Request failed");
  }
  return (await response.json()) as T;
}

/**
 * Polls only while something is still being ingested. Ingestion is the one
 * server-side process the user waits on, and a permanent interval would keep
 * an idle notebook talking to the server forever.
 */
export function useSources(notebookId: string, options?: SWRConfiguration) {
  const result = useSWR<{ sources: Source[] }>(
    `/api/notebooks/${notebookId}/sources`,
    fetcher,
    {
      refreshInterval: (latest) =>
        latest?.sources.some(
          (source) => source.status === "pending" || source.status === "processing",
        )
          ? 1500
          : 0,
      ...options,
    },
  );

  return { ...result, sources: result.data?.sources ?? [] };
}

export function useMessages(notebookId: string) {
  const result = useSWR<{ messages: StoredMessage[] }>(
    `/api/notebooks/${notebookId}/messages`,
    fetcher,
  );
  return { ...result, messages: result.data?.messages ?? [] };
}
