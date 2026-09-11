import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { handleRouteError, requireOwnedNotebook } from "@/lib/api";
import { TtsError, renderSegment } from "@/lib/audio/tts";
import { concatPcm, pcmDurationMs, pcmToWav, type PcmFormat } from "@/lib/audio/wav";
import { getDb } from "@/lib/db";
import { audioOverviews, type AudioSegment } from "@/lib/db/schema";
import { deleteFile, getFile, putFile } from "@/lib/storage";

/**
 * How many times a segment may be re-attempted before it is given up on.
 * Rate limiting is the common failure here and it clears on its own, so a
 * segment that hit a quota goes back to pending rather than being written off.
 */
const MAX_ATTEMPTS = 6;

/**
 * Renders the next unfinished segment, or assembles the finished audio when
 * they are all done. The client calls this repeatedly until the overview
 * reports `ready` or `failed`, which keeps every request short regardless of
 * how long the whole overview takes.
 */
export async function POST(
  _request: Request,
  ctx: RouteContext<"/api/notebooks/[id]/audio/render">,
) {
  try {
    const { id } = await ctx.params;
    const notebook = await requireOwnedNotebook(id);
    const db = getDb();

    const [job] = await db
      .select()
      .from(audioOverviews)
      .where(eq(audioOverviews.notebookId, notebook.id))
      .orderBy(desc(audioOverviews.createdAt))
      .limit(1);

    if (!job || job.status !== "running" || !job.script || !job.segments) {
      return NextResponse.json({ audio: job ?? null });
    }

    const segments: AudioSegment[] = job.segments.map((s) => ({ ...s }));
    const next = segments.find((segment) => segment.status === "pending");

    if (next) {
      try {
        const { pcm, format } = await renderSegment(
          job.script.slice(next.turnStart, next.turnEnd),
        );
        // Each segment is parked in storage because the next one is rendered by
        // a separate request, which shares no memory with this one.
        next.blobUrl = await putFile(
          `notebooks/${notebook.id}/audio-${job.id}-${next.idx}.pcm`,
          pcm,
        );
        next.byteLength = pcm.byteLength;
        next.sampleRate = format.sampleRate;
        next.status = "ready";
        next.error = undefined;
      } catch (error) {
        const attempts = (next.attempts ?? 0) + 1;
        next.attempts = attempts;
        next.error =
          error instanceof Error ? error.message : "Rendering failed.";

        // A quota that clears in a minute must not permanently fail a segment,
        // so a retryable error leaves it pending for the next call to pick up.
        const retryable = error instanceof TtsError && error.retryable;
        next.status = retryable && attempts < MAX_ATTEMPTS ? "pending" : "failed";
      }

      const [updated] = await db
        .update(audioOverviews)
        .set({ segments })
        .where(eq(audioOverviews.id, job.id))
        .returning();

      // Tells the client to pace itself instead of hammering a rate limit.
      return NextResponse.json({
        audio: updated,
        retryAfterMs: next.status === "pending" && next.attempts ? 30_000 : 0,
      });
    }

    // Nothing pending: stitch the rendered segments into one file.
    const ready = segments.filter((segment) => segment.status === "ready");
    if (ready.length === 0) {
      const [failed] = await db
        .update(audioOverviews)
        .set({
          status: "failed",
          error: segments[0]?.error ?? "No audio could be rendered.",
        })
        .where(eq(audioOverviews.id, job.id))
        .returning();
      return NextResponse.json({ audio: failed });
    }

    const parts: Uint8Array[] = [];
    for (const segment of ready) {
      const data = segment.blobUrl ? await getFile(segment.blobUrl) : null;
      if (data) parts.push(data);
    }

    const format: PcmFormat = {
      sampleRate: ready[0]?.sampleRate ?? 24_000,
      channels: 1,
      bitsPerSample: 16,
    };
    const pcm = concatPcm(parts);
    const audioUrl = await putFile(
      `notebooks/${notebook.id}/audio-${job.id}.wav`,
      pcmToWav(pcm, format),
    );

    // The per-segment PCM has served its purpose and is far larger than the
    // finished file; leaving it behind would quietly fill the store.
    await Promise.all(
      ready.map((segment) =>
        segment.blobUrl ? deleteFile(segment.blobUrl) : Promise.resolve(),
      ),
    );

    const [done] = await db
      .update(audioOverviews)
      .set({
        status: "ready",
        audioUrl,
        durationMs: pcmDurationMs(pcm.byteLength, format),
        error: null,
        segments: segments.map((s) => ({ ...s, blobUrl: undefined })),
      })
      .where(eq(audioOverviews.id, job.id))
      .returning();

    return NextResponse.json({ audio: done });
  } catch (error) {
    return handleRouteError(error);
  }
}
