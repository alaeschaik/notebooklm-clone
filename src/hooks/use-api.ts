"use client";

import useSWR, { type SWRConfiguration } from "swr";

import type { Note, Source, StoredMessage } from "@/lib/types";

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
export function useSources(
  notebookId: string,
  initial?: Source[],
  options?: SWRConfiguration,
) {
  const result = useSWR<{ sources: Source[] }>(
    `/api/notebooks/${notebookId}/sources`,
    fetcher,
    {
      // Seeded from the server render, so the panel never flashes empty first.
      fallbackData: initial ? { sources: initial } : undefined,
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

/**
 * Exported so anything that writes a note can revalidate the same cache entry
 * the panel reads from. Saving an answer happens in the chat pane and the notes
 * live in the studio pane, so without a shared key the two drift until reload.
 */
export const notesKey = (notebookId: string) => `/api/notebooks/${notebookId}/notes`;

export function useNotes(notebookId: string) {
  const result = useSWR<{ notes: Note[] }>(notesKey(notebookId), fetcher);
  return { ...result, notes: result.data?.notes ?? [] };
}

export function useMessages(notebookId: string, initial?: StoredMessage[]) {
  const result = useSWR<{ messages: StoredMessage[] }>(
    `/api/notebooks/${notebookId}/messages`,
    fetcher,
    { fallbackData: initial ? { messages: initial } : undefined },
  );
  return { ...result, messages: result.data?.messages ?? [] };
}
