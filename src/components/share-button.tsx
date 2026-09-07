"use client";

import { Check, Copy, Share2 } from "lucide-react";
import { useState } from "react";

import { Button, IconButton } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { useT } from "@/lib/i18n/context";

export function ShareButton({
  notebookId,
  initialSlug,
  origin,
}: {
  notebookId: string;
  initialSlug: string | null;
  /** Supplied by the server: this component is server-rendered, where
   * `window` does not exist. */
  origin: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState(initialSlug);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const url = slug ? `${origin}/share/${slug}` : "";

  async function enable() {
    setBusy(true);
    try {
      const response = await fetch(`/api/notebooks/${notebookId}/share`, {
        method: "POST",
      });
      const data = (await response.json()) as { publicSlug: string | null };
      setSlug(data.publicSlug);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      await fetch(`/api/notebooks/${notebookId}/share`, { method: "DELETE" });
      setSlug(null);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <>
      <IconButton title={t.share.action} onClick={() => setOpen(true)}>
        <Share2 className="size-4" />
      </IconButton>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t.share.title}
        description={t.share.description}
        footer={
          slug ? (
            <Button size="sm" variant="danger" onClick={disable} disabled={busy}>
              {t.share.disable}
            </Button>
          ) : (
            <Button size="sm" variant="primary" onClick={enable} disabled={busy}>
              {busy ? <Spinner /> : t.share.enable}
            </Button>
          )
        }
      >
        {slug ? (
          <div className="flex gap-2">
            <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
            <Button size="md" onClick={copy}>
              {copied ? (
                <Check className="size-3.5 text-success" />
              ) : (
                <Copy className="size-3.5" />
              )}
              {copied ? t.common.copied : t.common.copy}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-fg-subtle">{t.share.description}</p>
        )}
      </Dialog>
    </>
  );
}
