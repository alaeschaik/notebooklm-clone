import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { handleRouteError, requireOwnedNotebook } from "@/lib/api";
import { getDb } from "@/lib/db";
import { messages } from "@/lib/db/schema";

import { instrument } from "@/lib/observability/http";
async function handleGET(
  _request: Request,
  ctx: RouteContext<"/api/notebooks/[id]/messages">,
) {
  try {
    const { id } = await ctx.params;
    const notebook = await requireOwnedNotebook(id);

    const rows = await getDb()
      .select()
      .from(messages)
      .where(eq(messages.notebookId, notebook.id))
      .orderBy(asc(messages.createdAt));

    return NextResponse.json({ messages: rows });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** Clears the conversation without touching sources or studio output. */
async function handleDELETE(
  _request: Request,
  ctx: RouteContext<"/api/notebooks/[id]/messages">,
) {
  try {
    const { id } = await ctx.params;
    const notebook = await requireOwnedNotebook(id);
    await getDb().delete(messages).where(eq(messages.notebookId, notebook.id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

export const GET = instrument("/api/notebooks/[id]/messages", handleGET);
export const DELETE = instrument("/api/notebooks/[id]/messages", handleDELETE);
