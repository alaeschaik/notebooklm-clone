import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { badRequest, handleRouteError, readJson, requireOwnedNotebook } from "@/lib/api";
import { getDb } from "@/lib/db";
import { notes, type CitationMarker, type StoredCitation } from "@/lib/db/schema";

import { instrument } from "@/lib/observability/http";
async function handleGET(
  _request: Request,
  ctx: RouteContext<"/api/notebooks/[id]/notes">,
) {
  try {
    const { id } = await ctx.params;
    const notebook = await requireOwnedNotebook(id);

    const rows = await getDb()
      .select()
      .from(notes)
      .where(eq(notes.notebookId, notebook.id))
      .orderBy(desc(notes.createdAt));

    return NextResponse.json({ notes: rows });
  } catch (error) {
    return handleRouteError(error);
  }
}

async function handlePOST(
  request: Request,
  ctx: RouteContext<"/api/notebooks/[id]/notes">,
) {
  try {
    const { id } = await ctx.params;
    const notebook = await requireOwnedNotebook(id);
    const body = await readJson<{
      title?: string;
      content?: string;
      origin?: "manual" | "chat" | "studio";
      citations?: StoredCitation[];
      markers?: CitationMarker[];
    }>(request);

    if (!body.content?.trim()) throw badRequest("A note needs some content.");

    const [note] = await getDb()
      .insert(notes)
      .values({
        notebookId: notebook.id,
        title: body.title?.trim() || "Note",
        content: body.content,
        origin: body.origin ?? "manual",
        citations: body.citations ?? null,
        markers: body.markers ?? null,
      })
      .returning();

    return NextResponse.json({ note }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

async function handleDELETE(
  request: Request,
  ctx: RouteContext<"/api/notebooks/[id]/notes">,
) {
  try {
    const { id } = await ctx.params;
    const notebook = await requireOwnedNotebook(id);
    const noteId = new URL(request.url).searchParams.get("noteId");
    if (!noteId) throw badRequest("Missing note id.");

    const db = getDb();
    const [note] = await db
      .select({ id: notes.id, notebookId: notes.notebookId })
      .from(notes)
      .where(eq(notes.id, noteId));

    if (note?.notebookId !== notebook.id) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    await db.delete(notes).where(eq(notes.id, note.id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

export const GET = instrument("/api/notebooks/[id]/notes", handleGET);
export const POST = instrument("/api/notebooks/[id]/notes", handlePOST);
export const DELETE = instrument("/api/notebooks/[id]/notes", handleDELETE);
