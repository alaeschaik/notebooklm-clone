"use client";

import { ArrowUp, Square, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Answer } from "@/components/chat/answer";
import { Spinner } from "@/components/ui/spinner";
import { useMessages } from "@/hooks/use-api";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/context";
import { readEventStream } from "@/lib/sse";
import type {
  CitationMarker,
  HighlightTarget,
  Source,
  StoredCitation,
} from "@/lib/types";

type ChatEvent =
  | { type: "start"; mode: "full" | "retrieval"; documents: number }
  | { type: "text"; text: string }
  | { type: "citation"; position: number; citation: StoredCitation }
  | { type: "done"; messageId: string }
  | { type: "error"; message: string };

type Streaming = {
  question: string;
  text: string;
  citations: StoredCitation[];
  markers: CitationMarker[];
  mode: "full" | "retrieval" | null;
  documents: number;
};

export function ChatPanel({
  notebookId,
  sources,
  selectedIds,
  onCitationClick,
}: {
  notebookId: string;
  sources: Source[];
  selectedIds: string[];
  onCitationClick: (target: HighlightTarget) => void;
}) {
  const t = useT();
  const { messages, mutate } = useMessages(notebookId);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState<Streaming | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const hasReadySource = sources.some((source) => source.status === "ready");
  const canSend = input.trim().length > 0 && selectedIds.length > 0 && !streaming;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, streaming?.text]);

  async function send() {
    const question = input.trim();
    if (!question || selectedIds.length === 0) return;

    setInput("");
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
        body: JSON.stringify({ question, sourceIds: selectedIds }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(body.error ?? t.errors.generic);
        setStreaming(null);
        return;
      }

      for await (const event of readEventStream<ChatEvent>(
        response.body,
        controller.signal,
      )) {
        if (event.type === "start") {
          setStreaming((s) =>
            s ? { ...s, mode: event.mode, documents: event.documents } : s,
          );
        } else if (event.type === "text") {
          setStreaming((s) => (s ? { ...s, text: s.text + event.text } : s));
        } else if (event.type === "citation") {
          setStreaming((s) =>
            s
              ? {
                  ...s,
                  markers: [
                    ...s.markers,
                    { position: event.position, index: event.citation.index },
                  ],
                  citations: s.citations.some(
                    (c) => c.index === event.citation.index,
                  )
                    ? s.citations
                    : [...s.citations, event.citation],
                }
              : s,
          );
        } else if (event.type === "error") {
          setError(event.message);
        }
      }

      await mutate();
    } catch (cause) {
      // Aborting is a user action, not a failure worth reporting.
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        setError(t.errors.network);
      }
      await mutate();
    } finally {
      setStreaming(null);
      abortRef.current = null;
    }
  }

  async function clearConversation() {
    if (!confirm(t.chat.clearConfirm)) return;
    await fetch(`/api/notebooks/${notebookId}/messages`, { method: "DELETE" });
    await mutate();
  }

  return (
    <>
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
        <h2 className="text-sm font-semibold">{t.chat.title}</h2>
        {messages.length > 0 && (
          <button
            onClick={clearConversation}
            aria-label={t.chat.clear}
            className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto max-w-2xl space-y-6">
          {messages.length === 0 && !streaming && (
            <p className="py-16 text-center text-sm text-fg-subtle">
              {hasReadySource ? t.chat.empty : t.chat.emptyNoSources}
            </p>
          )}

          {messages.map((message) =>
            message.role === "user" ? (
              <div key={message.id} className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-accent-soft px-3.5 py-2 text-[15px] text-fg">
                  {message.content}
                </p>
              </div>
            ) : (
              <div key={message.id} className="animate-fade-in">
                <Answer
                  content={message.content}
                  citations={message.citations ?? []}
                  markers={message.markers ?? []}
                  onCitationClick={onCitationClick}
                />
                <CitationList
                  citations={message.citations ?? []}
                  label={t.chat.citationsLabel}
                  onCitationClick={onCitationClick}
                />
              </div>
            ),
          )}

          {streaming && (
            <>
              <div className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-accent-soft px-3.5 py-2 text-[15px] text-fg">
                  {streaming.question}
                </p>
              </div>
              <div className="animate-fade-in">
                {streaming.mode && (
                  <p className="mb-2 text-xs text-fg-subtle">
                    {streaming.mode === "full"
                      ? t.chat.contextFull
                      : t.chat.contextRetrieval(streaming.documents)}
                  </p>
                )}
                {streaming.text ? (
                  <Answer
                    content={streaming.text}
                    citations={streaming.citations}
                    markers={streaming.markers}
                    onCitationClick={onCitationClick}
                  />
                ) : (
                  <p className="flex items-center gap-2 text-sm text-fg-subtle">
                    <Spinner className="size-3.5" />
                    {t.chat.thinking}
                  </p>
                )}
              </div>
            </>
          )}

          {error && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      <div className="shrink-0 border-t border-border p-3">
        <div className="mx-auto max-w-2xl">
          {selectedIds.length === 0 && hasReadySource && (
            <p className="mb-2 text-xs text-warning">
              {t.chat.noSourcesSelected}
            </p>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
            className="flex items-end gap-2 rounded-xl border border-border bg-surface p-1.5 focus-within:border-accent"
          >
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                // Enter sends; Shift+Enter adds a line, matching every other
                // chat input people already have muscle memory for.
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (canSend) void send();
                }
              }}
              placeholder={t.chat.placeholder}
              rows={1}
              disabled={!hasReadySource}
              className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none placeholder:text-fg-subtle disabled:opacity-50"
            />
            {streaming ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                aria-label={t.chat.stop}
                className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-fg transition-colors hover:bg-border-strong"
              >
                <Square className="size-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!canSend}
                aria-label={t.chat.send}
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors",
                  canSend
                    ? "bg-accent text-accent-fg hover:bg-accent-hover"
                    : "bg-surface-2 text-fg-subtle",
                )}
              >
                <ArrowUp className="size-4" />
              </button>
            )}
          </form>
        </div>
      </div>
    </>
  );
}

function CitationList({
  citations,
  label,
  onCitationClick,
}: {
  citations: StoredCitation[];
  label: string;
  onCitationClick: (target: HighlightTarget) => void;
}) {
  if (citations.length === 0) return null;

  return (
    <div className="mt-3 border-t border-border pt-2.5">
      <p className="mb-1.5 text-[11px] font-medium tracking-wide text-fg-subtle uppercase">
        {label}
      </p>
      <ul className="space-y-1">
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
              className="flex w-full items-baseline gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-surface-2"
            >
              <span className="shrink-0 text-[11px] font-semibold text-accent">
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
                <span className="line-clamp-2 text-xs text-fg-muted italic">
                  “{citation.quote}”
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
