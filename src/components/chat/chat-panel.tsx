"use client";

import {
  ArrowUp,
  BookmarkPlus,
  Check,
  MessagesSquare,
  Square,
  Trash2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";

import { Answer } from "@/components/chat/answer";
import { Suggestions } from "@/components/chat/suggestions";
import { IconButton } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { EmptyState, Panel, PanelBody } from "@/components/ui/panel";
import { Spinner } from "@/components/ui/spinner";
import { notesKey, useMessages } from "@/hooks/use-api";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/context";
import { readEventStream } from "@/lib/sse";
import { mutate as globalMutate } from "swr";
import type {
  CitationMarker,
  HighlightTarget,
  Source,
  StoredCitation,
  StoredMessage,
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

/** Lets the studio drop a question into the composer without lifting the
 * composer's state out of this component. */
export type ChatHandle = { ask: (question: string) => void };

export function ChatPanel({
  notebookId,
  sources,
  selectedIds,
  onCitationClick,
  initialMessages,
  ref,
}: {
  notebookId: string;
  sources: Source[];
  selectedIds: string[];
  onCitationClick: (target: HighlightTarget) => void;
  initialMessages?: StoredMessage[];
  ref?: Ref<ChatHandle>;
}) {
  const t = useT();
  const confirm = useConfirm();
  const { messages, mutate } = useMessages(notebookId, initialMessages);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState<Streaming | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const hasReadySource = sources.some((source) => source.status === "ready");
  const canSend =
    input.trim().length > 0 && selectedIds.length > 0 && !streaming;

  useImperativeHandle(
    ref,
    () => ({
      ask: (question: string) => {
        setInput(question);
        inputRef.current?.focus();
      },
    }),
    [],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length, streaming?.text]);

  /** Grows the composer with its content, up to a cap. */
  function resize(element: HTMLTextAreaElement) {
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 176)}px`;
  }

  const send = useCallback(
    async (question: string) => {
      if (!question.trim() || selectedIds.length === 0) return;

      setInput("");
      if (inputRef.current) inputRef.current.style.height = "auto";
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
    },
    [notebookId, selectedIds, mutate, t],
  );

  async function clearConversation() {
    const ok = await confirm({
      title: t.confirm.clearChat.title,
      message: t.confirm.clearChat.message,
      confirmLabel: t.confirm.clearChat.action,
      cancelLabel: t.common.cancel,
      destructive: true,
    });
    if (!ok) return;
    await fetch(`/api/notebooks/${notebookId}/messages`, { method: "DELETE" });
    await mutate();
  }

  return (
    <Panel
      title={t.chat.title}
      actions={
        messages.length > 0 ? (
          <IconButton
            title={t.chat.clear}
            size="icon-sm"
            onClick={clearConversation}
          >
            <Trash2 className="size-3.5" />
          </IconButton>
        ) : null
      }
    >
      <PanelBody className="px-4 py-6">
        {messages.length === 0 && !streaming ? (
          // Centred rather than pinned to the top: the panel is full height, so
          // an empty conversation would otherwise leave the prompt stranded
          // against the header above a screen of nothing.
          <div className="flex h-full items-center justify-center">
            <div className="w-full max-w-[34rem]">
              <EmptyState
                icon={<MessagesSquare className="size-5" />}
                title={hasReadySource ? t.chat.empty : t.chat.emptyNoSources}
              />
              {hasReadySource && selectedIds.length > 0 && (
                <Suggestions
                  notebookId={notebookId}
                  sourceIds={selectedIds}
                  onPick={(question) => void send(question)}
                />
              )}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-[46rem] space-y-7">
            {messages.map((message) =>
              message.role === "user" ? (
                <div key={message.id} className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-md bg-accent-soft px-3.5 py-2.5 text-[15px] leading-relaxed text-fg">
                    {message.content}
                  </p>
                </div>
              ) : (
                <div key={message.id} className="group animate-fade-in">
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
                  <SaveToNotes notebookId={notebookId} message={message} />
                </div>
              ),
            )}

            {streaming && (
              <>
                <div className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-md bg-accent-soft px-3.5 py-2.5 text-[15px] leading-relaxed text-fg">
                    {streaming.question}
                  </p>
                </div>
                <div className="animate-fade-in">
                  {streaming.mode && (
                    <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-fg-subtle">
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

            <div ref={bottomRef} />
          </div>
        )}

        {/* Outside the branch above: a request rejected before anything is
            stored leaves the conversation empty, and the error would be hidden
            behind the empty state exactly when it matters most. */}
        {error && (
          <p className="mx-auto mt-4 max-w-[46rem] rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </PanelBody>

      <div className="shrink-0 border-t border-border bg-surface px-4 py-3">
        <div className="mx-auto max-w-[46rem]">
          {selectedIds.length === 0 && hasReadySource && (
            <p className="mb-2 text-xs text-warning">
              {t.chat.noSourcesSelected}
            </p>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (canSend) void send(input.trim());
            }}
            className="flex items-end gap-2 rounded-xl border border-border bg-surface p-1.5 shadow-sm transition-colors focus-within:border-accent"
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                resize(event.target);
              }}
              onKeyDown={(event) => {
                // Enter sends, Shift+Enter adds a line — the convention every
                // other chat input has already taught people.
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (canSend) void send(input.trim());
                }
              }}
              placeholder={t.chat.placeholder}
              rows={1}
              disabled={!hasReadySource}
              className="max-h-44 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-[15px] leading-relaxed outline-none placeholder:text-fg-subtle disabled:opacity-50"
            />
            {streaming ? (
              <IconButton
                type="button"
                title={t.chat.stop}
                variant="subtle"
                size="icon"
                onClick={() => abortRef.current?.abort()}
                className="shrink-0 rounded-lg"
              >
                <Square className="size-3 fill-current" />
              </IconButton>
            ) : (
              <button
                type="submit"
                disabled={!canSend}
                aria-label={t.chat.send}
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors",
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
    </Panel>
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
    <div className="mt-4 rounded-lg border border-border bg-surface-2/60 p-2">
      <p className="mb-1 px-1.5 text-[10px] font-semibold tracking-wider text-fg-subtle uppercase">
        {label}
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

/**
 * Saving an answer keeps its citations, so a note stays as verifiable as the
 * answer it came from rather than degrading into a loose quote.
 */
function SaveToNotes({
  notebookId,
  message,
}: {
  notebookId: string;
  message: StoredMessage;
}) {
  const t = useT();
  const [saved, setSaved] = useState(false);

  async function save() {
    await fetch(notesKey(notebookId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: message.content.slice(0, 60).replace(/\s+\S*$/, "") || "Note",
        content: message.content,
        origin: "chat",
        citations: message.citations,
        markers: message.markers,
      }),
    });
    setSaved(true);
    // The note is written from the chat pane but displayed in the studio pane,
    // which reads its own cache entry. Without this the note only appears after
    // a reload, and the save looks like it did nothing.
    await globalMutate(notesKey(notebookId));
  }

  return (
    <button
      onClick={save}
      disabled={saved}
      className="mt-2 flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-fg-subtle opacity-0 transition group-hover:opacity-100 hover:bg-surface-2 hover:text-fg focus-visible:opacity-100 disabled:opacity-100"
    >
      {saved ? (
        <>
          <Check className="size-3 text-success" />
          {t.chat.saved}
        </>
      ) : (
        <>
          <BookmarkPlus className="size-3" />
          {t.chat.saveAsNote}
        </>
      )}
    </button>
  );
}
