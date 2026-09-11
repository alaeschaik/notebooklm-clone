import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { assertUuids, badRequest, handleRouteError, readJson, requireOwnedNotebook } from "@/lib/api";
import { audioScriptPrompt, languageInstruction } from "@/lib/ai/prompts";
import { generateStructured, loadSourceText } from "@/lib/ai/structured";
import { HOSTS, segmentScript } from "@/lib/audio/script";
import { getDb } from "@/lib/db";
import { audioOverviews, type DialogueTurn } from "@/lib/db/schema";
import { getLocale } from "@/lib/i18n/server";

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

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/notebooks/[id]/audio">,
) {
  try {
    const { id } = await ctx.params;
    const notebook = await requireOwnedNotebook(id);

    const [row] = await getDb()
      .select()
      .from(audioOverviews)
      .where(eq(audioOverviews.notebookId, notebook.id))
      .orderBy(desc(audioOverviews.createdAt))
      .limit(1);

    return NextResponse.json({ audio: row ?? null });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * Writes the script and plans the segments, but renders nothing.
 *
 * Rendering is driven segment by segment from the client instead (see
 * `audio/render`). Free-tier speech synthesis is rate limited to a few requests
 * per minute, so a five-minute overview spends most of its wall clock waiting —
 * comfortably past the platform's function ceiling if it were one request.
 * Splitting it also means a rate-limited segment retries on its own rather than
 * taking the whole overview down with it.
 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/notebooks/[id]/audio">,
) {
  try {
    const { id } = await ctx.params;
    const notebook = await requireOwnedNotebook(id);
    const body = await readJson<{ sourceIds?: unknown }>(request);
    const sourceIds = assertUuids(body.sourceIds ?? [], "source ids");

    const { text } = await loadSourceText(notebook.id, sourceIds);
    if (!text) {
      throw badRequest("Select at least one source that has finished processing.");
    }

    const db = getDb();
    // One overview per notebook: a new run replaces the old one rather than
    // accumulating rows nothing will ever read.
    await db
      .delete(audioOverviews)
      .where(eq(audioOverviews.notebookId, notebook.id));

    const [job] = await db
      .insert(audioOverviews)
      .values({ notebookId: notebook.id, status: "running" })
      .returning();

    try {
      const locale = await getLocale();
      const script = await generateStructured<{ turns: DialogueTurn[] }>({
        system: `${audioScriptPrompt([HOSTS[0].name, HOSTS[1].name])}\n\n${languageInstruction(locale)}`,
        prompt: `Here are the documents to discuss.\n\n${text}`,
        schema: SCRIPT_SCHEMA as unknown as Record<string, unknown>,
        effort: "high",
        maxTokens: 12_000,
      });

      const turns = script.turns.filter((turn) => turn.text.trim().length > 0);
      if (turns.length === 0) throw new Error("The script came back empty.");

      const [updated] = await db
        .update(audioOverviews)
        .set({ script: turns, segments: segmentScript(turns) })
        .where(eq(audioOverviews.id, job.id))
        .returning();

      return NextResponse.json({ audio: updated }, { status: 202 });
    } catch (error) {
      console.error("[audio] script generation failed", error);
      const [failed] = await db
        .update(audioOverviews)
        .set({
          status: "failed",
          error:
            error instanceof Error
              ? error.message
              : "The script could not be written.",
        })
        .where(eq(audioOverviews.id, job.id))
        .returning();
      return NextResponse.json({ audio: failed }, { status: 200 });
    }
  } catch (error) {
    return handleRouteError(error);
  }
}
