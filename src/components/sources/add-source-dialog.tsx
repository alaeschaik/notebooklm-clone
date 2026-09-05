"use client";

import { Link2, Type, Upload } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/cn";

type Tab = "upload" | "link" | "text";

export function AddSourceDialog({
  notebookId,
  open,
  onClose,
  onAdded,
}: {
  notebookId: string;
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const t = useT();
  const [tab, setTab] = useState<Tab>("upload");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const endpoint = `/api/notebooks/${notebookId}/sources`;

  function reset() {
    setUrl("");
    setText("");
    setTitle("");
    setError(null);
  }

  async function submit(body: BodyInit, headers?: HeadersInit) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(endpoint, { method: "POST", body, headers });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? t.errors.generic);
        return;
      }
      reset();
      onAdded();
      onClose();
    } catch {
      setError(t.errors.network);
    } finally {
      setBusy(false);
    }
  }

  async function upload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    await submit(form);
  }

  const tabs: { id: Tab; label: string; hint: string; icon: typeof Upload }[] = [
    { id: "upload", label: t.sources.dialog.upload, hint: t.sources.dialog.uploadHint, icon: Upload },
    { id: "link", label: t.sources.dialog.link, hint: t.sources.dialog.linkHint, icon: Link2 },
    { id: "text", label: t.sources.dialog.text, hint: t.sources.dialog.textHint, icon: Type },
  ];
  const active = tabs.find((item) => item.id === tab)!;

  return (
    <Dialog open={open} onClose={onClose} title={t.sources.dialog.title}>
      <div className="mb-4 flex gap-1 rounded-lg bg-surface-2 p-1">
        {tabs.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              setTab(item.id);
              setError(null);
            }}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
              tab === item.id
                ? "bg-surface text-fg shadow-sm"
                : "text-fg-subtle hover:text-fg",
            )}
          >
            <item.icon className="size-3.5" />
            {item.label}
          </button>
        ))}
      </div>

      <p className="mb-3 text-xs text-fg-subtle">{active.hint}</p>

      {tab === "upload" && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void upload(e.dataTransfer.files);
          }}
          onClick={() => fileInput.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-sm transition-colors",
            dragging
              ? "border-accent bg-accent-soft text-accent"
              : "border-border-strong text-fg-subtle hover:border-accent hover:text-fg",
          )}
        >
          {busy ? <Spinner /> : <Upload className="size-5" />}
          {t.sources.dialog.dropHere}
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown"
            className="hidden"
            onChange={(e) => void upload(e.target.files)}
          />
        </div>
      )}

      {tab === "link" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(JSON.stringify({ url }), {
              "content-type": "application/json",
            });
          }}
          className="flex gap-2"
        >
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t.sources.dialog.linkPlaceholder}
            inputMode="url"
            autoFocus
            className="h-9 flex-1 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-accent"
          />
          <Button variant="primary" disabled={busy || !url.trim()}>
            {busy ? <Spinner /> : t.common.add}
          </Button>
        </form>
      )}

      {tab === "text" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(
              JSON.stringify({ kind: "text", text, title: title || undefined }),
              { "content-type": "application/json" },
            );
          }}
          className="space-y-2"
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t.sources.dialog.titlePlaceholder}
            className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-accent"
          />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t.sources.dialog.textPlaceholder}
            rows={8}
            className="w-full resize-y rounded-lg border border-border bg-surface p-3 text-sm outline-none focus:border-accent"
          />
          <div className="flex justify-end">
            <Button variant="primary" disabled={busy || !text.trim()}>
              {busy ? <Spinner /> : t.common.add}
            </Button>
          </div>
        </form>
      )}

      {error && (
        <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}
    </Dialog>
  );
}
