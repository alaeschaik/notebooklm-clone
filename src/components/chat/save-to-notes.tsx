"use client";

import { BookmarkPlus, Check } from "lucide-react";
import { useState } from "react";
import { mutate } from "swr";

import { notesKey } from "@/hooks/use-api";
import { useT } from "@/lib/i18n/context";
import type { StoredMessage } from "@/lib/types";

/**
 * Saves an answer with its citations, so a note stays as verifiable as the
 * answer it came from rather than decaying into a loose quote.
 */
export function SaveToNotes({
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
    // Notes are rendered in the studio pane, which reads its own cache entry.
    await mutate(notesKey(notebookId));
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
