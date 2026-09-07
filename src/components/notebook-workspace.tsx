"use client";

import { ArrowLeft, PanelLeftClose, Sparkles } from "lucide-react";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";

import { ChatPanel, type ChatHandle } from "@/components/chat/chat-panel";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ShareButton } from "@/components/share-button";
import { SourceViewer } from "@/components/sources/source-viewer";
import { SourcesPanel } from "@/components/sources/sources-panel";
import { StudioPanel } from "@/components/studio/studio-panel";
import { IconButton } from "@/components/ui/button";
import { useSources } from "@/hooks/use-api";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/context";
import type { HighlightTarget, Source, StoredMessage } from "@/lib/types";

export function NotebookWorkspace({
  notebookId,
  title,
  emoji,
  publicSlug,
  origin,
  initialSources,
  initialMessages,
}: {
  notebookId: string;
  title: string;
  emoji: string;
  publicSlug: string | null;
  origin: string;
  initialSources: Source[];
  initialMessages: StoredMessage[];
}) {
  const t = useT();
  const { sources, mutate } = useSources(notebookId, initialSources);
  // Deselections are tracked rather than selections. A question is asked of the
  // whole notebook unless you narrow it, so "everything except what you turned
  // off" is the real state — it needs no effect to seed it, and a source added
  // later arrives selected without disturbing the existing choices.
  const [deselected, setDeselected] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [viewing, setViewing] = useState<HighlightTarget | null>(null);
  const [studioOpen, setStudioOpen] = useState(true);
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
    <div className="flex h-dvh flex-col overflow-hidden bg-border">
      <header className="flex h-13 shrink-0 items-center gap-2.5 border-b border-border bg-surface px-3">
        <Link
          href="/"
          aria-label={t.appName}
          title={t.appName}
          className="-ml-1 flex size-8 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <span aria-hidden className="text-base leading-none">
          {emoji}
        </span>
        <h1 className="truncate text-sm font-semibold tracking-tight">{title}</h1>

        <div className="ml-auto flex items-center gap-1.5">
          <ShareButton
            notebookId={notebookId}
            initialSlug={publicSlug}
            origin={origin}
          />
          <LocaleSwitcher />
          <IconButton
            title={t.studio.title}
            onClick={() => setStudioOpen((open) => !open)}
            className={cn("lg:hidden", studioOpen && "bg-surface-2 text-fg")}
          >
            <Sparkles className="size-4" />
          </IconButton>
          <IconButton
            title={t.studio.title}
            onClick={() => setStudioOpen((open) => !open)}
            className={cn("hidden lg:inline-flex", !studioOpen && "text-fg-subtle")}
          >
            <PanelLeftClose
              className={cn("size-4 transition-transform", studioOpen && "rotate-180")}
            />
          </IconButton>
        </div>
      </header>

      {/* Flex rather than grid: a width transition on a grid template column
          does not animate, so the reader used to snap open. */}
      <main className="flex min-h-0 flex-1 gap-px">
        <aside
          className={cn(
            "relative hidden shrink-0 overflow-hidden transition-[width] duration-300 ease-out md:block",
            viewing ? "w-[min(34rem,42vw)]" : "w-[19rem]",
          )}
        >
          <div
            className={cn(
              "absolute inset-0 flex flex-col transition-opacity duration-200",
              viewing ? "pointer-events-none opacity-0" : "opacity-100",
            )}
          >
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
          </div>

          <div
            className={cn(
              "absolute inset-0 flex flex-col transition-opacity duration-200",
              viewing ? "opacity-100" : "pointer-events-none opacity-0",
            )}
          >
            {viewing && (
              <SourceViewer target={viewing} onClose={() => setViewing(null)} />
            )}
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <ChatPanel
            notebookId={notebookId}
            sources={sources}
            selectedIds={selectedIds}
            onCitationClick={openCitation}
            initialMessages={initialMessages}
            ref={chat}
          />
        </section>

        <aside
          className={cn(
            "hidden shrink-0 overflow-hidden transition-[width] duration-300 ease-out lg:block",
            studioOpen ? "w-[21rem]" : "w-0",
          )}
        >
          <div className="flex h-full w-[21rem] flex-col">
            <StudioPanel
              notebookId={notebookId}
              sources={sources}
              selectedIds={selectedIds}
              onCitationClick={openCitation}
              onAsk={(question) => chat.current?.ask(question)}
            />
          </div>
        </aside>
      </main>
    </div>
  );
}
