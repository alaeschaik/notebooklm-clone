"use client";

import { NotebookPen, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { Answer } from "@/components/chat/answer";
import { StudioCard } from "@/components/studio/studio-card";
import { Button, IconButton } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { Dialog } from "@/components/ui/dialog";
import { useNotes } from "@/hooks/use-api";
import { useT } from "@/lib/i18n/context";
import type { HighlightTarget, Note } from "@/lib/types";

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

  const { notes, mutate } = useNotes(notebookId);

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
    <StudioCard
      icon={<NotebookPen className="size-3.5" />}
      title={t.studio.notes}
      hint={notes.length === 0 ? t.studio.notesEmpty : undefined}
      actions={
        <IconButton
          title={t.studio.newNote}
          size="icon-sm"
          onClick={() => setComposing(true)}
        >
          <Plus className="size-3.5" />
        </IconButton>
      }
    >
      {notes.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {notes.map((note) => (
            <li key={note.id} className="group flex items-center gap-1.5">
              <button
                onClick={() => setOpenNote(note)}
                className="min-w-0 flex-1 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-surface-2"
              >
                <span className="block truncate text-xs font-medium">
                  {note.title}
                </span>
                <span className="line-clamp-1 text-xs text-fg-subtle">
                  {note.content}
                </span>
              </button>
              <IconButton
                title={t.common.delete}
                size="icon-sm"
                onClick={() => remove(note.id)}
                className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:bg-danger-soft hover:text-danger"
              >
                <Trash2 className="size-3" />
              </IconButton>
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
          <Input
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            placeholder={t.sources.dialog.titlePlaceholder}
          />
          <Textarea
            value={draft.content}
            onChange={(event) => setDraft({ ...draft, content: event.target.value })}
            rows={8}
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" onClick={() => setComposing(false)}>
              {t.common.cancel}
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={create}
              disabled={!draft.content.trim()}
            >
              {t.common.save}
            </Button>
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
    </StudioCard>
  );
}
