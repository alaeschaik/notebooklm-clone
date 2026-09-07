"use client";

import { Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { IconButton } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const SPEEDS = [1, 1.25, 1.5, 2] as const;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${(total % 60).toString().padStart(2, "0")}`;
}

/**
 * A custom transport rather than `<audio controls>`. The native control is
 * styled by the browser, differs on every platform and cannot be made to sit
 * inside a 21rem panel without looking pasted in.
 *
 * The underlying element still does the work — this only drives it — so
 * buffering, seeking and media-key handling stay the browser's job.
 */
export function AudioPlayer({
  src,
  className,
}: {
  src: string;
  className?: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.playbackRate = speed;
  }, [speed]);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  }

  function skip(seconds: number) {
    const audio = audioRef.current;
    if (audio) audio.currentTime = Math.max(0, audio.currentTime + seconds);
  }

  const progress = duration > 0 ? (current / duration) * 100 : 0;

  return (
    <div className={cn("rounded-lg border border-border bg-surface p-2.5", className)}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
      />

      <div className="flex items-center gap-1.5">
        <button
          onClick={toggle}
          aria-label={playing ? "Pause" : "Play"}
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg transition-colors hover:bg-accent-hover"
        >
          {playing ? (
            <Pause className="size-3.5 fill-current" />
          ) : (
            <Play className="size-3.5 translate-x-px fill-current" />
          )}
        </button>

        <IconButton title="Back 10 seconds" size="icon-sm" onClick={() => skip(-10)}>
          <RotateCcw className="size-3.5" />
        </IconButton>
        <IconButton title="Forward 10 seconds" size="icon-sm" onClick={() => skip(10)}>
          <RotateCw className="size-3.5" />
        </IconButton>

        <span className="ml-auto text-[11px] tabular-nums text-fg-subtle">
          {formatTime(current)} / {formatTime(duration)}
        </span>

        <button
          onClick={() =>
            setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]!)
          }
          aria-label="Playback speed"
          className="rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          {speed}×
        </button>
      </div>

      <div className="relative mt-2">
        <div className="h-1 overflow-hidden rounded-full bg-surface-3">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${progress}%` }}
          />
        </div>
        {/* A transparent range on top keeps scrubbing keyboard-accessible
            while the visible bar stays fully styleable. */}
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={current}
          onChange={(event) => {
            const audio = audioRef.current;
            if (audio) audio.currentTime = Number(event.target.value);
          }}
          aria-label="Seek"
          className="absolute inset-0 -top-2 h-5 w-full cursor-pointer opacity-0"
        />
      </div>
    </div>
  );
}
