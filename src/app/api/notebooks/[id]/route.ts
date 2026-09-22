import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { handleRouteError, readJson, requireOwnedNotebook } from "@/lib/api";
import { getDb } from "@/lib/db";
import { notebooks } from "@/lib/db/schema";

import { instrument } from "@/lib/observability/http";
async function handleGET(
  _request: Request,
  ctx: RouteContext<"/api/notebooks/[id]">,
) {
  try {
    const { id } = await ctx.params;
    return NextResponse.json({ notebook: await requireOwnedNotebook(id) });
  } catch (error) {
    return handleRouteError(error);
  }
}

async function handlePATCH(
  request: Request,
  ctx: RouteContext<"/api/notebooks/[id]">,
) {
  try {
    const { id } = await ctx.params;
    const notebook = await requireOwnedNotebook(id);
    const body = await readJson<{ title?: string; emoji?: string }>(request);

    const [updated] = await getDb()
      .update(notebooks)
      .set({
        ...(body.title !== undefined ? { title: body.title.trim() || "Untitled notebook" } : {}),
        ...(body.emoji !== undefined ? { emoji: body.emoji } : {}),
        updatedAt: new Date(),
      })
      .where(eq(notebooks.id, notebook.id))
      .returning();

    return NextResponse.json({ notebook: updated });
  } catch (error) {
    return handleRouteError(error);
  }
}

async function handleDELETE(
  _request: Request,
  ctx: RouteContext<"/api/notebooks/[id]">,
) {
  try {
    const { id } = await ctx.params;
    const notebook = await requireOwnedNotebook(id);
    // Sources, chunks, messages and studio output cascade from the schema.
    await getDb().delete(notebooks).where(eq(notebooks.id, notebook.id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

export const GET = instrument("/api/notebooks/[id]", handleGET);
export const PATCH = instrument("/api/notebooks/[id]", handlePATCH);
export const DELETE = instrument("/api/notebooks/[id]", handleDELETE);
