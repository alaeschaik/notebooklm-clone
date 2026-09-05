"use client";

import { NotebookPen, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";

import { Answer } from "@/components/chat/answer";
import { Dialog } from "@/components/ui/dialog";
import { fetcher } from "@/hooks/use-api";
import { useT } from "@/lib/i18n/context";
import type { CitationMarker, HighlightTarget, StoredCitation } from "@/lib/types";

type Note = {
  id: string;
  title: string;
  content: string;
  origin: "manual" | "chat" | "studio";
  citations: StoredCitation[] | null;
  markers: CitationMarker[] | null;
  createdAt: string;
};

export function NotesCard({
  notebookId,
  onCitationClick,
}: {
  notebookId: string;
  onCitationClick: (target: HighlightTarget) => void;
}) {
  const t = useT();
  const [composing, setComposing] = useState(false);
  const [openNote, setOpenNote] = useState<Note | null>(null);
  const [draft, setDraft] = useState({ title: "", content: "" });

  const { data, mutate } = useSWR<{ notes: Note[] }>(
    `/api/notebooks/${notebookId}/notes`,
    fetcher,
  );
  const notes = data?.notes ?? [];

  async function create() {
    if (!draft.content.trim()) return;
    await fetch(`/api/notebooks/${notebookId}/notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...draft, origin: "manual" }),
    });
    setDraft({ title: "", content: "" });
    setComposing(false);
    await mutate();
  }

  async function remove(noteId: string) {
    await fetch(`/api/notebooks/${notebookId}/notes?noteId=${noteId}`, {
      method: "DELETE",
    });
    await mutate();
  }

  return (
    <section className="rounded-xl border border-border bg-surface-2 p-3">
      <div className="flex items-center gap-2">
        <NotebookPen className="size-4 text-accent" />
        <h3 className="text-[13px] font-semibold">{t.studio.notes}</h3>
        <button
          onClick={() => setComposing(true)}
          aria-label={t.studio.newNote}
          className="ml-auto rounded p-1 text-fg-subtle hover:bg-surface hover:text-fg"
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      {notes.length === 0 ? (
        <p className="mt-2 text-xs text-fg-subtle">{t.studio.notesEmpty}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {notes.map((note) => (
            <li key={note.id} className="group flex items-center gap-1.5">
              <button
                onClick={() => setOpenNote(note)}
                className="min-w-0 flex-1 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-surface"
              >
                <span className="block truncate text-xs font-medium">
                  {note.title}
                </span>
                <span className="line-clamp-1 text-xs text-fg-subtle">
                  {note.content}
                </span>
              </button>
              <button
                onClick={() => remove(note.id)}
                aria-label={t.common.delete}
                className="rounded p-1 text-fg-subtle opacity-0 transition group-hover:opacity-100 hover:bg-danger-soft hover:text-danger"
              >
                <Trash2 className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={composing}
        onClose={() => setComposing(false)}
        title={t.studio.newNote}
      >
        <div className="space-y-2">
          <input
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            placeholder={t.sources.dialog.titlePlaceholder}
            className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-accent"
          />
          <textarea
            value={draft.content}
            onChange={(event) => setDraft({ ...draft, content: event.target.value })}
            rows={8}
            className="w-full resize-y rounded-lg border border-border bg-surface p-3 text-sm outline-none focus:border-accent"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setComposing(false)}
              className="rounded-lg px-3 py-1.5 text-sm text-fg-muted hover:bg-surface-2"
            >
              {t.common.cancel}
            </button>
            <button
              onClick={create}
              disabled={!draft.content.trim()}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg disabled:opacity-50"
            >
              {t.common.save}
            </button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={openNote !== null}
        onClose={() => setOpenNote(null)}
        title={openNote?.title ?? ""}
        className="w-[min(44rem,calc(100vw-2rem))]"
      >
        {openNote && (
          <div className="max-h-[70vh] overflow-y-auto">
            <Answer
              content={openNote.content}
              citations={openNote.citations ?? []}
              markers={openNote.markers ?? []}
              onCitationClick={(target) => {
                setOpenNote(null);
                onCitationClick(target);
              }}
            />
          </div>
        )}
      </Dialog>
    </section>
  );
}
