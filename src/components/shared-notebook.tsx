"use client";

import { Eye } from "lucide-react";
import { useState } from "react";

import { Answer } from "@/components/chat/answer";
import { SourceIcon } from "@/components/sources/source-icon";
import { SourceViewer } from "@/components/sources/source-viewer";
import { EmptyState, Panel, PanelBody } from "@/components/ui/panel";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/context";
import type { HighlightTarget, Source, StoredMessage } from "@/lib/types";

/**
 * A read-only rendering of a shared notebook. Deliberately a separate component
 * rather than the workspace with controls hidden: a reader has no session here,
 * so every mutating affordance would fail if it were reachable at all.
 */
export function SharedNotebook({
  slug,
  title,
  emoji,
  sources,
  messages,
}: {
  slug: string;
  title: string;
  emoji: string;
  sources: Source[];
  messages: StoredMessage[];
}) {
  const t = useT();
  const [viewing, setViewing] = useState<HighlightTarget | null>(null);

  return (
    // `fixed inset-0` rather than a viewport height unit: this is a
    // full-viewport app shell, and anchoring it to the viewport directly means
    // the columns fill it without depending on an unbroken html/body height
    // chain above them.
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-border">
      <header className="flex h-13 shrink-0 items-center gap-2.5 border-b border-border bg-surface px-4">
        <span aria-hidden className="text-base leading-none">
          {emoji}
        </span>
        <h1 className="truncate text-sm font-semibold tracking-tight">{title}</h1>
        <span className="ml-auto flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-fg-muted">
          <Eye className="size-3" />
          {t.share.readOnly}
        </span>
      </header>

      <main className="flex min-h-0 flex-1 gap-px">
        <aside
          className={cn(
            "hidden shrink-0 overflow-hidden transition-[width] duration-300 ease-out md:block",
            viewing ? "w-[min(34rem,42vw)]" : "w-[19rem]",
          )}
        >
          <div className={cn("h-full", viewing && "hidden")}>
            <Panel title={t.sources.title}>
              <PanelBody className="p-2">
                <ul className="space-y-0.5">
                  {sources.map((source) => (
                    <li key={source.id}>
                      <button
                        onClick={() =>
                          setViewing({
                            sourceId: source.id,
                            startChar: 0,
                            endChar: 0,
                          })
                        }
                        disabled={source.status !== "ready"}
                        className="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-2 disabled:opacity-50"
                      >
                        <SourceIcon
                          kind={source.kind}
                          className="size-3.5 shrink-0 text-fg-subtle"
                        />
                        <span className="truncate text-[13px] font-medium">
                          {source.title}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </PanelBody>
            </Panel>
          </div>

          {viewing && (
            <div className="h-full">
              <SourceViewer
                target={viewing}
                onClose={() => setViewing(null)}
                resolveUrl={(sourceId) =>
                  `/api/shared/${slug}/sources/${sourceId}`
                }
              />
            </div>
          )}
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Panel title={t.chat.title}>
            <PanelBody className="px-4 py-6">
              <div className="mx-auto max-w-[46rem] space-y-7">
                <p className="rounded-lg border border-accent-border bg-accent-soft px-3 py-2 text-xs leading-relaxed text-fg-muted">
                  {t.share.readOnlyBanner}
                </p>

                {messages.length === 0 ? (
                  <EmptyState title={t.common.empty} />
                ) : (
                  messages.map((message) =>
                    message.role === "user" ? (
                      <div key={message.id} className="flex justify-end">
                        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-accent-soft px-3.5 py-2.5 text-[15px] leading-relaxed">
                          {message.content}
                        </p>
                      </div>
                    ) : (
                      <Answer
                        key={message.id}
                        content={message.content}
                        citations={message.citations ?? []}
                        markers={message.markers ?? []}
                        onCitationClick={setViewing}
                      />
                    ),
                  )
                )}
              </div>
            </PanelBody>
          </Panel>
        </section>
      </main>
    </div>
  );
}
