import { desc, eq } from "drizzle-orm";
import { NextResponse, after } from "next/server";

import { assertUuids, badRequest, handleRouteError, readJson, requireOwnedNotebook } from "@/lib/api";
import { audioScriptPrompt, languageInstruction } from "@/lib/ai/prompts";
import { getLocale } from "@/lib/i18n/server";
import { generateStructured, loadSourceText } from "@/lib/ai/structured";
import { HOSTS, segmentScript } from "@/lib/audio/script";
import { renderSegment } from "@/lib/audio/tts";
import { concatPcm, pcmDurationMs, pcmToWav, type PcmFormat } from "@/lib/audio/wav";
import { getDb } from "@/lib/db";
import { audioOverviews, type AudioSegment, type DialogueTurn } from "@/lib/db/schema";
import type { Locale } from "@/lib/i18n/dictionaries";
import { putFile } from "@/lib/storage";

export const maxDuration = 300;

/** A run stuck this long is treated as dead, so a retry is possible. */
const STALE_AFTER_MS = 10 * 60 * 1000;

const SCRIPT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    turns: {
      type: "array",
      items: {
        type: "object",
        properties: {
          speaker: { type: "string", enum: [HOSTS[0].name, HOSTS[1].name] },
          text: { type: "string" },
        },
        required: ["speaker", "text"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "turns"],
  additionalProperties: false,
} as const;

async function latest(notebookId: string) {
  const [row] = await getDb()
    .select()
    .from(audioOverviews)
    .where(eq(audioOverviews.notebookId, notebookId))
    .orderBy(desc(audioOverviews.createdAt))
    .limit(1);
  return row;
}

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/notebooks/[id]/audio">,
) {
  try {
    const { id } = await ctx.params;
    const notebook = await requireOwnedNotebook(id);
    return NextResponse.json({ audio: (await latest(notebook.id)) ?? null });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/notebooks/[id]/audio">,
) {
  try {
    const { id } = await ctx.params;
    const notebook = await requireOwnedNotebook(id);
    const body = await readJson<{ sourceIds?: unknown }>(request);
    const sourceIds = assertUuids(body.sourceIds ?? [], "source ids");

    const existing = await latest(notebook.id);
    if (
      existing?.status === "running" &&
      Date.now() - existing.createdAt.getTime() < STALE_AFTER_MS
    ) {
      return NextResponse.json({ audio: existing });
    }

    const { text } = await loadSourceText(notebook.id, sourceIds);
    if (!text) {
      throw badRequest("Select at least one source that has finished processing.");
    }

    const db = getDb();
    const [job] = await db
      .insert(audioOverviews)
      .values({ notebookId: notebook.id, status: "running" })
      .returning();

    // `after` keeps the serverless function alive past the response instead of
    // it being frozen the moment the 202 is sent, which is what a bare
    // floating promise would get. Rendering an overview is a handful of speech
    // requests, well inside the function budget, and progress is written to
    // the row as it goes so the client polls real state rather than a guess.
    const locale = await getLocale();
    after(() => generate(job.id, notebook.id, text, locale));

    return NextResponse.json({ audio: job }, { status: 202 });
  } catch (error) {
    return handleRouteError(error);
  }
}

async function generate(
  jobId: string,
  notebookId: string,
  sourceText: string,
  locale: Locale,
) {
  const db = getDb();

  const fail = async (message: string) => {
    await db
      .update(audioOverviews)
      .set({ status: "failed", error: message })
      .where(eq(audioOverviews.id, jobId));
  };

  try {
    const script = await generateStructured<{
      title: string;
      turns: DialogueTurn[];
    }>({
      system: `${audioScriptPrompt([HOSTS[0].name, HOSTS[1].name])}\n\n${languageInstruction(locale)}`,
      prompt: `Here are the documents to discuss.\n\n${sourceText}`,
      schema: SCRIPT_SCHEMA as unknown as Record<string, unknown>,
      effort: "high",
      maxTokens: 12_000,
    });

    const turns = script.turns.filter((turn) => turn.text.trim().length > 0);
    if (turns.length === 0) {
      await fail("The script came back empty. Try again.");
      return;
    }

    const segments = segmentScript(turns);
    await db
      .update(audioOverviews)
      .set({ script: turns, segments })
      .where(eq(audioOverviews.id, jobId));

    const rendered: Uint8Array[] = [];
    const progress: AudioSegment[] = segments.map((segment) => ({ ...segment }));
    let format: PcmFormat | undefined;

    for (const segment of progress) {
      try {
        const result = await renderSegment(
          turns.slice(segment.turnStart, segment.turnEnd),
        );
        rendered.push(result.pcm);
        format ??= result.format;
        segment.status = "ready";
        segment.byteLength = result.pcm.byteLength;
      } catch (error) {
        segment.status = "failed";
        segment.error =
          error instanceof Error ? error.message : "Rendering failed.";
      }

      await db
        .update(audioOverviews)
        .set({ segments: progress })
        .where(eq(audioOverviews.id, jobId));
    }

    if (rendered.length === 0) {
      await fail("No audio could be rendered. Please try again.");
      return;
    }

    const pcm = concatPcm(rendered);
    const wav = pcmToWav(pcm, format);
    const url = await putFile(
      `notebooks/${notebookId}/audio-${jobId}.wav`,
      wav,
      "audio/wav",
    );

    await db
      .update(audioOverviews)
      .set({
        status: "ready",
        audioUrl: url,
        durationMs: pcmDurationMs(pcm.byteLength, format),
        error: null,
      })
      .where(eq(audioOverviews.id, jobId));
  } catch (error) {
    console.error("[audio] job failed", error);
    await fail(
      error instanceof Error
        ? error.message
        : "The audio overview could not be generated.",
    );
  }
}
