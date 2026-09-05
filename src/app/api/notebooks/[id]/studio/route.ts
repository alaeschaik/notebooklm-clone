import { desc, eq } from "drizzle-orm";
import { NextResponse, after } from "next/server";

import { assertUuids, badRequest, handleRouteError, readJson, requireOwnedNotebook } from "@/lib/api";
import { CitationResolver } from "@/lib/ai/citations";
import { getClaude, groundedDefaults } from "@/lib/ai/claude";
import { buildContext } from "@/lib/ai/context";
import { STUDIO_BRIEFS, STUDIO_SYSTEM, languageInstruction } from "@/lib/ai/prompts";
import { getLocale } from "@/lib/i18n/server";
import { getDb } from "@/lib/db";
import { studioDocs, studioKind, type CitationMarker } from "@/lib/db/schema";
import type { Locale } from "@/lib/i18n/dictionaries";

export const maxDuration = 300;

type Kind = (typeof studioKind.enumValues)[number];

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/notebooks/[id]/studio">,
) {
  try {
    const { id } = await ctx.params;
    const notebook = await requireOwnedNotebook(id);

    const rows = await getDb()
      .select()
      .from(studioDocs)
      .where(eq(studioDocs.notebookId, notebook.id))
      .orderBy(desc(studioDocs.createdAt));

    return NextResponse.json({ docs: rows });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/notebooks/[id]/studio">,
) {
  try {
    const { id } = await ctx.params;
    const notebook = await requireOwnedNotebook(id);
    const body = await readJson<{ kind?: string; sourceIds?: unknown; title?: string }>(request);

    const kind = body.kind as Kind | undefined;
    if (!kind || !studioKind.enumValues.includes(kind)) {
      throw badRequest("Unknown document type.");
    }

    const sourceIds = assertUuids(body.sourceIds ?? [], "source ids");
    if (sourceIds.length === 0) {
      throw badRequest("Select at least one source.");
    }

    const [doc] = await getDb()
      .insert(studioDocs)
      .values({
        notebookId: notebook.id,
        kind,
        title: body.title?.trim() || kind,
        status: "running",
      })
      .returning();

    const locale = await getLocale();
    after(() => generate(doc.id, notebook.id, kind, sourceIds, locale));

    return NextResponse.json({ doc }, { status: 202 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  request: Request,
  ctx: RouteContext<"/api/notebooks/[id]/studio">,
) {
  try {
    const { id } = await ctx.params;
    const notebook = await requireOwnedNotebook(id);
    const docId = new URL(request.url).searchParams.get("docId");
    if (!docId) throw badRequest("Missing document id.");

    const db = getDb();
    const [doc] = await db
      .select({ id: studioDocs.id, notebookId: studioDocs.notebookId })
      .from(studioDocs)
      .where(eq(studioDocs.id, docId));

    if (doc?.notebookId !== notebook.id) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    await db.delete(studioDocs).where(eq(studioDocs.id, doc.id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

async function generate(
  docId: string,
  notebookId: string,
  kind: Kind,
  sourceIds: string[],
  locale: Locale,
) {
  const db = getDb();

  try {
    const context = await buildContext({
      notebookId,
      sourceIds,
      question: STUDIO_BRIEFS[kind] ?? kind,
    });

    if (context.blocks.length === 0) {
      throw new Error("None of the selected sources are ready.");
    }

    // Non-streaming: a studio document is read once it is finished, so there is
    // nothing to gain from rendering it a token at a time.
    const response = await getClaude().beta.messages.create({
      ...groundedDefaults(),
      max_tokens: 12_000,
      output_config: { effort: "high" },
      system: `${STUDIO_SYSTEM}\n\n${languageInstruction(locale)}`,
      messages: [
        {
          role: "user",
          content: [
            ...context.blocks,
            { type: "text", text: STUDIO_BRIEFS[kind] ?? kind },
          ],
        },
      ],
    });

    const resolver = new CitationResolver(context.refs, {
      segmentsBySource: context.segmentsBySource,
    });
    const markers: CitationMarker[] = [];
    let content = "";

    for (const block of response.content) {
      if (block.type !== "text") continue;
      content += block.text;
      for (const raw of block.citations ?? []) {
        const citation = resolver.add(raw);
        if (citation) markers.push({ position: content.length, index: citation.index });
      }
    }

    await db
      .update(studioDocs)
      .set({
        content,
        citations: resolver.all(),
        markers,
        status: "ready",
        error: null,
      })
      .where(eq(studioDocs.id, docId));
  } catch (error) {
    console.error("[studio] generation failed", error);
    await db
      .update(studioDocs)
      .set({
        status: "failed",
        error:
          error instanceof Error
            ? error.message
            : "The document could not be generated.",
      })
      .where(eq(studioDocs.id, docId));
  }
}
