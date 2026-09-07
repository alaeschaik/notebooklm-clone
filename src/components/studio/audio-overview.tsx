"use client";

import { AlertCircle, Headphones, RotateCcw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { fetcher } from "@/hooks/use-api";
import { useT } from "@/lib/i18n/context";
import type { AudioSegment, DialogueTurn } from "@/lib/db/schema";

type AudioOverview = {
  id: string;
  status: "pending" | "running" | "ready" | "failed";
  error: string | null;
  script: DialogueTurn[] | null;
  segments: AudioSegment[] | null;
  audioUrl: string | null;
  durationMs: number | null;
};

export function AudioOverviewCard({
  notebookId,
  selectedIds,
  disabled,
}: {
  notebookId: string;
  selectedIds: string[];
  disabled: boolean;
}) {
  const t = useT();
  const [starting, setStarting] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  const { data, mutate } = useSWR<{ audio: AudioOverview | null }>(
    `/api/notebooks/${notebookId}/audio`,
    fetcher,
  );

  const audio = data?.audio ?? null;
  const driving = useRef(false);

  /**
   * Renders one segment per request until the overview finishes.
   *
   * The work is paced from here rather than run server-side in one go because
   * free-tier speech synthesis is rate limited per minute: a full overview
   * spends most of its time waiting, which would blow a serverless function's
   * time limit. Driving it from the client also makes each step's progress
   * visible instead of the user watching a spinner for five minutes.
   */
  const drive = useCallback(async () => {
    if (driving.current) return;
    driving.current = true;
    try {
      for (;;) {
        const response = await fetch(
          `/api/notebooks/${notebookId}/audio/render`,
          { method: "POST" },
        );
        if (!response.ok) break;
        const next = (await response.json()) as {
          audio: AudioOverview | null;
          retryAfterMs?: number;
        };
        await mutate({ audio: next.audio }, false);
        if (next.audio?.status !== "running") break;

        // The server asks for a pause when a segment hit a rate limit; retrying
        // immediately would just burn the next attempt on the same quota.
        if (next.retryAfterMs) {
          await new Promise((resolve) => setTimeout(resolve, next.retryAfterMs));
        }
      }
    } finally {
      driving.current = false;
    }
  }, [notebookId, mutate]);

  // Resumes a run that was interrupted by a reload.
  useEffect(() => {
    if (audio?.status === "running" && audio.segments?.length) void drive();
  }, [audio?.status, audio?.segments?.length, drive]);
  const running = audio?.status === "running" || audio?.status === "pending";
  const segments = audio?.segments ?? [];
  const done = segments.filter((segment) => segment.status === "ready").length;
  // A segment that is retrying still has something worth telling the user.
  const waiting = segments.find(
    (segment) => segment.status === "pending" && (segment.attempts ?? 0) > 0,
  );

  async function generate() {
    setStarting(true);
    try {
      const response = await fetch(`/api/notebooks/${notebookId}/audio`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceIds: selectedIds }),
      });
      const next = (await response.json()) as { audio: AudioOverview | null };
      await mutate(next, false);
      if (next.audio?.status === "running") void drive();
    } finally {
      setStarting(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface-2 p-3">
      <div className="flex items-center gap-2">
        <Headphones className="size-4 text-accent" />
        <h3 className="text-[13px] font-semibold">{t.studio.audio}</h3>
      </div>

      {!audio && (
        <>
          <p className="mt-1 text-xs text-fg-subtle">{t.studio.audioHint}</p>
          <Button
            variant="primary"
            size="sm"
            className="mt-2.5 w-full"
            onClick={generate}
            disabled={disabled || starting}
          >
            {starting ? <Spinner /> : <Sparkles className="size-3.5" />}
            {t.studio.audioGenerate}
          </Button>
        </>
      )}

      {running && (
        <div className="mt-2.5">
          <p className="flex items-center gap-2 text-xs text-fg-muted">
            <Spinner className="size-3" />
            {segments.length === 0
              ? t.studio.audioGenerating
              : t.studio.audioRendering(done, segments.length)}
          </p>
          {waiting?.error && (
            <p className="mt-1.5 text-xs text-warning">{waiting.error}</p>
          )}
          {segments.length > 0 && (
            <div
              role="progressbar"
              aria-valuenow={done}
              aria-valuemax={segments.length}
              className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3"
            >
              <div
                className="h-full bg-accent transition-[width] duration-500"
                style={{ width: `${(done / segments.length) * 100}%` }}
              />
            </div>
          )}
        </div>
      )}

      {audio?.status === "failed" && (
        <div className="mt-2.5">
          <p className="flex items-start gap-1.5 text-xs text-danger">
            <AlertCircle className="mt-px size-3 shrink-0" />
            {audio.error ?? t.studio.audioFailed}
          </p>
          <Button size="sm" className="mt-2 w-full" onClick={generate}>
            <RotateCcw className="size-3.5" />
            {t.common.retry}
          </Button>
        </div>
      )}

      {audio?.status === "ready" && audio.audioUrl && (
        <div className="mt-2.5 space-y-2">
          {/* The native player gives scrubbing, volume and keyboard control
              for free, and matches whatever the listener's OS already does. */}
          <audio controls preload="metadata" src={audio.audioUrl} className="w-full" />
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTranscript((value) => !value)}
              className="text-xs font-medium text-accent hover:underline"
            >
              {t.studio.transcript}
            </button>
            <button
              onClick={generate}
              className="ml-auto text-xs text-fg-subtle hover:text-fg"
            >
              {t.common.regenerate}
            </button>
          </div>

          {showTranscript && audio.script && (
            <ol className="max-h-64 space-y-1.5 overflow-y-auto rounded-lg bg-surface p-2.5">
              {audio.script.map((turn, index) => (
                <li key={index} className="text-xs leading-relaxed">
                  <span className="font-semibold text-accent">
                    {turn.speaker}
                  </span>{" "}
                  <span className="text-fg-muted">{turn.text}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
