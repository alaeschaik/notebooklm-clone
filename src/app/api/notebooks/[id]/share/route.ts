import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { handleRouteError, requireOwnedNotebook } from "@/lib/api";
import { getDb } from "@/lib/db";
import { notebooks } from "@/lib/db/schema";

/**
 * Sharing mints an unguessable slug rather than exposing the notebook id.
 * Reusing the id would mean revoking a share and re-sharing hands out the same
 * address, so an old link would silently come back to life.
 */
export async function POST(
  _request: Request,
  ctx: RouteContext<"/api/notebooks/[id]/share">,
) {
  try {
    const { id } = await ctx.params;
    const notebook = await requireOwnedNotebook(id);

    const slug = notebook.publicSlug ?? randomBytes(12).toString("base64url");
    const [updated] = await getDb()
      .update(notebooks)
      .set({ publicSlug: slug })
      .where(eq(notebooks.id, notebook.id))
      .returning({ publicSlug: notebooks.publicSlug });

    return NextResponse.json({ publicSlug: updated.publicSlug });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/notebooks/[id]/share">,
) {
  try {
    const { id } = await ctx.params;
    const notebook = await requireOwnedNotebook(id);

    await getDb()
      .update(notebooks)
      .set({ publicSlug: null })
      .where(eq(notebooks.id, notebook.id));

    return NextResponse.json({ publicSlug: null });
  } catch (error) {
    return handleRouteError(error);
  }
}
