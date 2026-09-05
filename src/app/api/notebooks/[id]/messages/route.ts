import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { handleRouteError, requireOwnedNotebook } from "@/lib/api";
import { getDb } from "@/lib/db";
import { messages } from "@/lib/db/schema";

export async function GET(
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
export async function DELETE(
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
