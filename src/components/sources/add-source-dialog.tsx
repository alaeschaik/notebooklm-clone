"use client";

import { AlertCircle, Link2, Type, Upload } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/context";

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
      const response = await fetch(`/api/notebooks/${notebookId}/sources`, {
        method: "POST",
        body,
        headers,
      });
      const data = (await response.json()) as {
        error?: string;
        source?: { status: string; error: string | null };
      };

      if (!response.ok) {
        setError(data.error ?? t.errors.generic);
        return;
      }
      // Ingestion records its own failure on the row and still returns 201, so
      // a failed source has to be surfaced here rather than treated as success.
      if (data.source?.status === "failed") {
        setError(data.source.error ?? t.errors.generic);
        onAdded();
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

  const tabs = [
    { id: "upload" as const, label: t.sources.dialog.upload, hint: t.sources.dialog.uploadHint, icon: Upload },
    { id: "link" as const, label: t.sources.dialog.link, hint: t.sources.dialog.linkHint, icon: Link2 },
    { id: "text" as const, label: t.sources.dialog.text, hint: t.sources.dialog.textHint, icon: Type },
  ];
  const active = tabs.find((item) => item.id === tab)!;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t.sources.dialog.title}
      description={active.hint}
    >
      <div
        role="tablist"
        className="mb-4 flex gap-1 rounded-lg bg-surface-2 p-1"
      >
        {tabs.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
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

      {tab === "upload" && (
        <button
          type="button"
          disabled={busy}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void upload(event.dataTransfer.files);
          }}
          onClick={() => fileInput.current?.click()}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-12 text-[13px] transition-colors",
            dragging
              ? "border-accent bg-accent-soft text-accent"
              : "border-border-strong text-fg-subtle hover:border-accent hover:bg-accent-soft/40 hover:text-fg",
          )}
        >
          {busy ? <Spinner className="size-5" /> : <Upload className="size-5" />}
          {t.sources.dialog.dropHere}
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown"
            className="hidden"
            onChange={(event) => void upload(event.target.files)}
          />
        </button>
      )}

      {tab === "link" && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit(JSON.stringify({ url }), {
              "content-type": "application/json",
            });
          }}
          className="flex gap-2"
        >
          <Input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder={t.sources.dialog.linkPlaceholder}
            inputMode="url"
            autoFocus
          />
          <Button variant="primary" disabled={busy || !url.trim()}>
            {busy ? <Spinner /> : t.common.add}
          </Button>
        </form>
      )}

      {tab === "text" && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit(
              JSON.stringify({ kind: "text", text, title: title || undefined }),
              { "content-type": "application/json" },
            );
          }}
          className="space-y-2"
        >
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t.sources.dialog.titlePlaceholder}
          />
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={t.sources.dialog.textPlaceholder}
            rows={8}
          />
          <div className="flex justify-end">
            <Button variant="primary" disabled={busy || !text.trim()}>
              {busy ? <Spinner /> : t.common.add}
            </Button>
          </div>
        </form>
      )}

      {error && (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-danger-soft px-3 py-2 text-xs leading-relaxed text-danger">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      )}
    </Dialog>
  );
}
