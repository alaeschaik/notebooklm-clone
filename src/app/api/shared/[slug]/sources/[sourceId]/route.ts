import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { assertUuid, handleRouteError, notFound } from "@/lib/api";
import { getDb } from "@/lib/db";
import { notebooks, sources } from "@/lib/db/schema";

/**
 * The reader in a shared notebook needs source text, but the owner-scoped
 * source route would reject a visitor who does not own it. This serves the same
 * data gated on the share slug instead — and only for a notebook that is
 * actually shared, since the slug is the entire proof of access.
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/shared/[slug]/sources/[sourceId]">,
) {
  try {
    const { slug, sourceId } = await ctx.params;

    const [row] = await getDb()
      .select({ source: sources })
      .from(sources)
      .innerJoin(notebooks, eq(sources.notebookId, notebooks.id))
      .where(
        and(
          eq(notebooks.publicSlug, slug),
          eq(sources.id, assertUuid(sourceId, "source id")),
        ),
      );

    if (!row) throw notFound("Source not found.");
    return NextResponse.json({ source: row.source });
  } catch (error) {
    return handleRouteError(error);
  }
}
