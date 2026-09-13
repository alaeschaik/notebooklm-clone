"use client";

import { AlertCircle, Headphones, RotateCcw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";

import { AudioPlayer } from "@/components/studio/audio-player";
import { StudioCard } from "@/components/studio/studio-card";
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
   * Renders one segment per request until the overview finishes. Paced here
   * rather than server-side because the free tier is rate limited, and because
   * it turns a five-minute spinner into visible progress.
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
        // at once would spend the next attempt on the same exhausted quota.
        if (next.retryAfterMs) {
          await new Promise((resolve) => setTimeout(resolve, next.retryAfterMs));
        }
      }
    } finally {
      driving.current = false;
    }
  }, [notebookId, mutate]);

  // Resumes a run interrupted by a reload.
  useEffect(() => {
    if (audio?.status === "running" && audio.segments?.length) void drive();
  }, [audio?.status, audio?.segments?.length, drive]);

  async function generate() {
    setStarting(true);
    setShowTranscript(false);
    try {
      const response = await fetch(`/api/notebooks/${notebookId}/audio`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceIds: selectedIds }),
      });
      const next = (await response.json()) as { audio: AudioOverview | null };
      await mutate({ audio: next.audio }, false);
      if (next.audio?.status === "running") void drive();
    } finally {
      setStarting(false);
    }
  }

  const segments = audio?.segments ?? [];
  const done = segments.filter((segment) => segment.status === "ready").length;
  const running = audio?.status === "running" || audio?.status === "pending";
  const waiting = segments.find(
    (segment) => segment.status === "pending" && (segment.attempts ?? 0) > 0,
  );

  return (
    <StudioCard
      icon={<Headphones className="size-3.5" />}
      title={t.studio.audio}
      hint={!audio ? t.studio.audioHint : undefined}
      actions={
        audio?.status === "ready" ? (
          <button
            onClick={generate}
            className="rounded px-1 text-[11px] text-fg-subtle transition-colors hover:text-fg"
          >
            {t.common.regenerate}
          </button>
        ) : null
      }
    >
      {!audio && (
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
      )}

      {running && (
        <div className="mt-2.5">
          <p className="flex items-center gap-2 text-xs text-fg-muted">
            <Spinner className="size-3" />
            {segments.length === 0
              ? t.studio.audioGenerating
              : t.studio.audioRendering(done, segments.length)}
          </p>

          {waiting && (
            <p className="mt-1.5 rounded-md bg-warning-soft px-2 py-1.5 text-[11px] leading-snug text-warning">
              {t.studio.audioWaiting}
            </p>
          )}

          {segments.length > 0 && (
            <div
              role="progressbar"
              aria-valuenow={done}
              aria-valuemin={0}
              aria-valuemax={segments.length}
              className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3"
            >
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-500"
                style={{ width: `${(done / segments.length) * 100}%` }}
              />
            </div>
          )}
        </div>
      )}

      {audio?.status === "failed" && (
        <div className="mt-2.5">
          <p className="flex items-start gap-1.5 rounded-md bg-danger-soft px-2 py-1.5 text-xs leading-snug text-danger">
            <AlertCircle className="mt-0.5 size-3 shrink-0" />
            {audio.error ?? t.studio.audioFailed}
          </p>
          <Button size="sm" className="mt-2 w-full" onClick={generate}>
            <RotateCcw className="size-3.5" />
            {t.common.retry}
          </Button>
        </div>
      )}

      {audio?.status === "ready" && audio.audioUrl && (
        <div className="mt-2.5">
          <AudioPlayer src={audio.audioUrl} />

          {audio.script && (
            <>
              <button
                onClick={() => setShowTranscript((value) => !value)}
                className="mt-2 rounded px-1 text-xs font-medium text-accent hover:underline"
              >
                {showTranscript ? t.studio.hideTranscript : t.studio.transcript}
              </button>

              {showTranscript && (
                <ol className="mt-1.5 max-h-72 space-y-2 overflow-y-auto rounded-lg bg-surface-2 p-2.5">
                  {audio.script.map((turn, index) => (
                    <li key={index} className="text-xs leading-relaxed">
                      <span className="font-semibold text-accent">
                        {turn.speaker}
                      </span>
                      <span className="text-fg-muted"> {turn.text}</span>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </div>
      )}
    </StudioCard>
  );
}
