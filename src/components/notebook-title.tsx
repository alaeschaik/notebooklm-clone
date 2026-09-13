"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/context";

/**
 * The notebook's name, editable in place. It is seeded from the first source,
 * which is a guess and often wrong, so it has to be changeable — and the title
 * is already on screen, which makes a settings dialog the longer way round.
 */
export function NotebookTitle({
  notebookId,
  initialTitle,
}: {
  notebookId: string;
  initialTitle: string;
}) {
  const t = useT();
  const router = useRouter();
  // Held locally so the rename shows instantly; the refresh below then brings
  // the server's copy — and the notebook index — back in step.
  const [title, setTitle] = useState(initialTitle);
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function commit(next: string) {
    setEditing(false);

    const trimmed = next.trim();
    // An empty title would leave nothing to click on to fix it.
    const resolved = trimmed || t.home.untitled;
    if (resolved === title) return;

    setTitle(resolved);
    await fetch(`/api/notebooks/${notebookId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: resolved }),
    });
    router.refresh();
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        defaultValue={title}
        // The field only exists because the user just clicked to edit it, so
        // focusing it is the whole interaction rather than a hijack.
        autoFocus
        aria-label={t.home.renameTitle}
        onFocus={(event) => event.currentTarget.select()}
        onBlur={(event) => void commit(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void commit(event.currentTarget.value);
          }
          if (event.key === "Escape") {
            event.preventDefault();
            // Blur would otherwise fire and commit the discarded text.
            event.currentTarget.value = title;
            setEditing(false);
          }
        }}
        className="min-w-0 flex-1 rounded-md border border-accent bg-surface px-1.5 py-0.5 text-sm font-semibold tracking-tight outline-none"
      />
    );
  }

  // The heading wraps the control rather than the other way round: the
  // notebook's name is the page's heading whether or not it is being edited,
  // and a heading nested inside a button is not a thing assistive technology
  // reads sensibly.
  return (
    <h1 className="min-w-0 text-sm font-semibold tracking-tight">
      <button
        onClick={() => setEditing(true)}
        title={t.common.rename}
        className={cn(
          "group -mx-1.5 flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5",
          "transition-colors hover:bg-surface-2",
        )}
      >
        <span className="truncate">{title}</span>
        <Pencil className="size-3 shrink-0 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100" />
      </button>
    </h1>
  );
}
