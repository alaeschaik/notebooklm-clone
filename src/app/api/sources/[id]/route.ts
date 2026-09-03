import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { handleRouteError, requireOwnedSource } from "@/lib/api";
import { getDb } from "@/lib/db";
import { sources } from "@/lib/db/schema";

/** Returns the full text so the reader can highlight a cited range in place. */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/sources/[id]">,
) {
  try {
    const { id } = await ctx.params;
    const { source } = await requireOwnedSource(id);
    return NextResponse.json({ source });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/sources/[id]">,
) {
  try {
    const { id } = await ctx.params;
    const { source } = await requireOwnedSource(id);
    await getDb().delete(sources).where(eq(sources.id, source.id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
