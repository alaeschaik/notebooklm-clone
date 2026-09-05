import { desc, eq } from "drizzle-orm";
import { NextResponse, after } from "next/server";

import { assertUuids, badRequest, handleRouteError, readJson, requireOwnedNotebook } from "@/lib/api";
import { MIND_MAP_SYSTEM, languageInstruction } from "@/lib/ai/prompts";
import { getLocale } from "@/lib/i18n/server";
import { generateStructured, loadSourceText } from "@/lib/ai/structured";
import { getDb } from "@/lib/db";
import { mindMaps, type MindMapNode } from "@/lib/db/schema";
import type { Locale } from "@/lib/i18n/dictionaries";

export const maxDuration = 300;

/**
 * Three levels, declared explicitly rather than recursively: JSON Schema
 * recursion via $ref is supported unevenly, and a hand-rolled depth limit also
 * enforces the "deeper than three is unreadable" rule at the schema level.
 */
const node = (depth: number): Record<string, unknown> => ({
  type: "object",
  properties: {
    label: { type: "string" },
    summary: { type: "string" },
    ...(depth > 0 ? { children: { type: "array", items: node(depth - 1) } } : {}),
  },
  required: depth > 0 ? ["label", "summary", "children"] : ["label", "summary"],
  additionalProperties: false,
});

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/notebooks/[id]/mindmap">,
) {
  try {
    const { id } = await ctx.params;
    const notebook = await requireOwnedNotebook(id);

    const [row] = await getDb()
      .select()
      .from(mindMaps)
      .where(eq(mindMaps.notebookId, notebook.id))
      .orderBy(desc(mindMaps.createdAt))
      .limit(1);

    return NextResponse.json({ mindMap: row ?? null });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/notebooks/[id]/mindmap">,
) {
  try {
    const { id } = await ctx.params;
    const notebook = await requireOwnedNotebook(id);
    const body = await readJson<{ sourceIds?: unknown }>(request);
    const sourceIds = assertUuids(body.sourceIds ?? [], "source ids");

    const { text } = await loadSourceText(notebook.id, sourceIds);
    if (!text) throw badRequest("Select at least one source that is ready.");

    const [job] = await getDb()
      .insert(mindMaps)
      .values({ notebookId: notebook.id, status: "running" })
      .returning();

    const locale = await getLocale();
    after(() => generate(job.id, text, locale));
    return NextResponse.json({ mindMap: job }, { status: 202 });
  } catch (error) {
    return handleRouteError(error);
  }
}

async function generate(jobId: string, sourceText: string, locale: Locale) {
  const db = getDb();
  try {
    const map = await generateStructured<MindMapNode>({
      system: `${MIND_MAP_SYSTEM}\n\n${languageInstruction(locale)}`,
      prompt: `Map the structure of these documents.\n\n${sourceText}`,
      schema: node(2),
      effort: "medium",
    });

    await db
      .update(mindMaps)
      .set({ data: map, status: "ready", error: null })
      .where(eq(mindMaps.id, jobId));
  } catch (error) {
    console.error("[mindmap] generation failed", error);
    await db
      .update(mindMaps)
      .set({
        status: "failed",
        error:
          error instanceof Error
            ? error.message
            : "The mind map could not be generated.",
      })
      .where(eq(mindMaps.id, jobId));
  }
}
