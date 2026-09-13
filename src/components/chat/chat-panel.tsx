"use client";

import { MessagesSquare, Trash2 } from "lucide-react";
import { useCallback, useEffect, useImperativeHandle, useRef, type Ref } from "react";

import { Answer } from "@/components/chat/answer";
import { CitationList } from "@/components/chat/citation-list";
import { Composer, type ComposerHandle } from "@/components/chat/composer";
import { SaveToNotes } from "@/components/chat/save-to-notes";
import { Suggestions } from "@/components/chat/suggestions";
import { IconButton } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { EmptyState, Panel, PanelBody } from "@/components/ui/panel";
import { Spinner } from "@/components/ui/spinner";
import { useMessages } from "@/hooks/use-api";
import { useChatStream } from "@/hooks/use-chat-stream";
import { useT } from "@/lib/i18n/context";
import type { HighlightTarget, Source, StoredMessage } from "@/lib/types";

/** Lets the studio drop a question into the composer. */
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const composer = useRef<ComposerHandle>(null);

  const { streaming, error, send, stop } = useChatStream({
    notebookId,
    onSettled: useCallback(() => mutate(), [mutate]),
    messages: { network: t.errors.network, generic: t.errors.generic },
  });

  useImperativeHandle(ref, () => ({ ask: (q) => composer.current?.fill(q) }), []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length, streaming?.text]);

  const hasReadySource = sources.some((source) => source.status === "ready");
  const isEmpty = messages.length === 0 && !streaming;

  async function clearConversation() {
    const confirmed = await confirm({
      title: t.confirm.clearChat.title,
      message: t.confirm.clearChat.message,
      confirmLabel: t.confirm.clearChat.action,
      cancelLabel: t.common.cancel,
      destructive: true,
    });
    if (!confirmed) return;

    await fetch(`/api/notebooks/${notebookId}/messages`, { method: "DELETE" });
    await mutate();
  }

  return (
    <Panel
      title={t.chat.title}
      actions={
        messages.length > 0 ? (
          <IconButton title={t.chat.clear} size="icon-sm" onClick={clearConversation}>
            <Trash2 className="size-3.5" />
          </IconButton>
        ) : null
      }
    >
      <PanelBody className="px-4 py-6">
        {isEmpty ? (
          // Centred: the panel is full height, so an empty conversation pinned
          // to the top strands the prompt above a screen of nothing.
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
                  onPick={(question) => void send(question, selectedIds)}
                />
              )}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-[46rem] space-y-7">
            {messages.map((message) =>
              message.role === "user" ? (
                <Question key={message.id} text={message.content} />
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
                    onCitationClick={onCitationClick}
                  />
                  <SaveToNotes notebookId={notebookId} message={message} />
                </div>
              ),
            )}

            {streaming && (
              <>
                <Question text={streaming.question} />
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
            behind the empty state exactly when it matters. */}
        {error && (
          <p className="mx-auto mt-4 max-w-[46rem] rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </PanelBody>

      <Composer
        ref={composer}
        disabled={!hasReadySource}
        streaming={streaming !== null}
        warning={
          selectedIds.length === 0 && hasReadySource
            ? t.chat.noSourcesSelected
            : undefined
        }
        onSend={(question) => void send(question, selectedIds)}
        onStop={stop}
      />
    </Panel>
  );
}

function Question({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] rounded-2xl rounded-br-md bg-accent-soft px-3.5 py-2.5 text-[15px] leading-relaxed text-fg">
        {text}
      </p>
    </div>
  );
}
