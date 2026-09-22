import { NextResponse } from "next/server";

import { assertUuids, handleRouteError, readJson, requireOwnedNotebook } from "@/lib/api";
import { languageInstruction } from "@/lib/ai/prompts";
import { generateStructured, loadSourceText } from "@/lib/ai/structured";
import { getLocale } from "@/lib/i18n/server";

import { instrument } from "@/lib/observability/http";
const SCHEMA = {
  type: "object",
  properties: {
    questions: { type: "array", items: { type: "string" } },
  },
  required: ["questions"],
  additionalProperties: false,
} as const;

const SYSTEM = `You propose opening questions for someone who has just added documents to a notebook and does not yet know what is in them.

Write exactly four. Each must be answerable from these documents alone, and each should open a different part of the material rather than four angles on the same point.

Prefer the questions a curious reader would actually ask over the ones that merely summarise. Keep each under twelve words, phrased as a question.`;

/**
 * Generated on demand rather than stored: the useful questions change as
 * sources are added or deselected, and a cached set goes stale immediately.
 */
async function handlePOST(
  request: Request,
  ctx: RouteContext<"/api/notebooks/[id]/suggestions">,
) {
  try {
    const { id } = await ctx.params;
    const notebook = await requireOwnedNotebook(id);
    const body = await readJson<{ sourceIds?: unknown }>(request);
    const sourceIds = assertUuids(body.sourceIds ?? [], "source ids");

    const { text } = await loadSourceText(notebook.id, sourceIds);
    if (!text) return NextResponse.json({ questions: [] });

    const locale = await getLocale();
    const result = await generateStructured<{ questions: string[] }>({
      system: `${SYSTEM}\n\n${languageInstruction(locale)}`,
      // Only the opening of each source is needed to know what it is about,
      // and this runs on every empty notebook view.
      prompt: `Here are the documents.\n\n${text.slice(0, 60_000)}`,
      schema: SCHEMA as unknown as Record<string, unknown>,
      effort: "low",
      maxTokens: 1000,
    });

    return NextResponse.json({ questions: result.questions.slice(0, 4) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export const POST = instrument("/api/notebooks/[id]/suggestions", handlePOST);
