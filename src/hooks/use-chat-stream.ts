"use client";

import { useCallback, useRef, useState } from "react";

import { readEventStream } from "@/lib/sse";
import type { CitationMarker, StoredCitation } from "@/lib/types";

type ChatEvent =
  | { type: "start"; mode: ContextMode; documents: number }
  | { type: "text"; text: string }
  | { type: "citation"; position: number; citation: StoredCitation }
  | { type: "done"; messageId: string }
  | { type: "error"; message: string };

export type ContextMode = "full" | "retrieval";

/** The answer being streamed, assembled from the events so far. */
export type Streaming = {
  question: string;
  text: string;
  citations: StoredCitation[];
  markers: CitationMarker[];
  mode: ContextMode | null;
  documents: number;
};

/**
 * Owns the lifecycle of one streamed answer: sending, accumulating deltas,
 * aborting, and reporting failure. Kept out of the panel so the panel is only
 * responsible for rendering what this returns.
 */
export function useChatStream({
  notebookId,
  onSettled,
  messages,
}: {
  notebookId: string;
  /** Called once a turn ends, to refresh the persisted conversation. */
  onSettled: () => Promise<unknown>;
  messages: { network: string; generic: string };
}) {
  const [streaming, setStreaming] = useState<Streaming | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const send = useCallback(
    async (question: string, sourceIds: string[]) => {
      if (!question.trim() || sourceIds.length === 0) return;

      setError(null);
      setStreaming({
        question,
        text: "",
        citations: [],
        markers: [],
        mode: null,
        documents: 0,
      });

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch(`/api/notebooks/${notebookId}/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ question, sourceIds }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const body = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          setError(body.error ?? messages.generic);
          setStreaming(null);
          return;
        }

        for await (const event of readEventStream<ChatEvent>(
          response.body,
          controller.signal,
        )) {
          setStreaming((current) => (current ? apply(current, event) : current));
          if (event.type === "error") setError(event.message);
        }

        await onSettled();
      } catch (cause) {
        // Aborting is a user action, not a failure worth reporting.
        if (!(cause instanceof DOMException && cause.name === "AbortError")) {
          setError(messages.network);
        }
        await onSettled();
      } finally {
        setStreaming(null);
        abortRef.current = null;
      }
    },
    [notebookId, onSettled, messages.generic, messages.network],
  );

  return { streaming, error, send, stop };
}

function apply(current: Streaming, event: ChatEvent): Streaming {
  switch (event.type) {
    case "start":
      return { ...current, mode: event.mode, documents: event.documents };
    case "text":
      return { ...current, text: current.text + event.text };
    case "citation":
      return {
        ...current,
        markers: [
          ...current.markers,
          { position: event.position, index: event.citation.index },
        ],
        // A passage cited more than once keeps its original marker.
        citations: current.citations.some((c) => c.index === event.citation.index)
          ? current.citations
          : [...current.citations, event.citation],
      };
    default:
      return current;
  }
}
