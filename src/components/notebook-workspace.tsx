"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";

import { ChatPanel, type ChatHandle } from "@/components/chat/chat-panel";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { SourceViewer } from "@/components/sources/source-viewer";
import { SourcesPanel } from "@/components/sources/sources-panel";
import { StudioPanel } from "@/components/studio/studio-panel";
import { useSources } from "@/hooks/use-api";
import { cn } from "@/lib/cn";
import type { HighlightTarget } from "@/lib/types";

export function NotebookWorkspace({
  notebookId,
  title,
  emoji,
}: {
  notebookId: string;
  title: string;
  emoji: string;
}) {
  const { sources, mutate } = useSources(notebookId);
  // Deselections are tracked rather than selections. A question is asked of the
  // whole notebook unless you narrow it, so "everything except what you turned
  // off" is the real state — and it needs no effect to seed it, and leaves a
  // source added later selected without disturbing the existing choices.
  const [deselected, setDeselected] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [viewing, setViewing] = useState<HighlightTarget | null>(null);
  const chat = useRef<ChatHandle>(null);

  const readyIds = sources
    .filter((source) => source.status === "ready")
    .map((source) => source.id);
  const selectedIds = readyIds.filter((id) => !deselected.has(id));

  const toggle = useCallback((id: string) => {
    setDeselected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const setAll = useCallback(
    (on: boolean) => setDeselected(on ? new Set() : new Set(readyIds)),
    [readyIds],
  );

  const openCitation = useCallback((target: HighlightTarget) => {
    setViewing(target);
  }, []);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
        <Link
          href="/"
          className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
          aria-label="Back to notebooks"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <span className="text-lg leading-none">{emoji}</span>
        <h1 className="truncate font-medium">{title}</h1>
        <div className="ml-auto flex items-center gap-2">
          <LocaleSwitcher />
        </div>
      </header>

      <main className="grid min-h-0 flex-1 gap-px bg-border lg:grid-cols-[minmax(0,var(--left))_minmax(0,1fr)_minmax(0,22rem)]"
        style={{ "--left": viewing ? "34rem" : "19rem" } as React.CSSProperties}
      >
        <section
          className={cn(
            "flex min-h-0 min-w-0 flex-col bg-surface transition-[width]",
          )}
        >
          {viewing ? (
            <SourceViewer
              target={viewing}
              onClose={() => setViewing(null)}
            />
          ) : (
            <SourcesPanel
              notebookId={notebookId}
              sources={sources}
              selected={selectedIds}
              onToggle={toggle}
              onToggleAll={setAll}
              onOpen={(sourceId) =>
                setViewing({ sourceId, startChar: 0, endChar: 0 })
              }
              onChanged={() => void mutate()}
            />
          )}
        </section>

        <section className="flex min-h-0 min-w-0 flex-col bg-surface">
          <ChatPanel
            notebookId={notebookId}
            sources={sources}
            selectedIds={selectedIds}
            onCitationClick={openCitation}
            ref={chat}
          />
        </section>

        <section className="hidden min-h-0 min-w-0 flex-col bg-surface lg:flex">
          <StudioPanel
            notebookId={notebookId}
            sources={sources}
            selectedIds={selectedIds}
            onCitationClick={openCitation}
            onAsk={(question) => chat.current?.ask(question)}
          />
        </section>
      </main>
    </div>
  );
}
