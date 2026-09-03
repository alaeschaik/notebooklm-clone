import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { badRequest, handleRouteError, requireOwnedNotebook } from "@/lib/api";
import { getDb } from "@/lib/db";
import { sources, type sourceKind } from "@/lib/db/schema";
import { ingestSource, type IngestInput } from "@/lib/ingest/pipeline";
import { parseVideoId } from "@/lib/ingest/youtube";

/** Ingestion parses, chunks and embeds in one request; give it room. */
export const maxDuration = 300;

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

type Kind = (typeof sourceKind.enumValues)[number];

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/notebooks/[id]/sources">,
) {
  try {
    const { id } = await ctx.params;
    const notebook = await requireOwnedNotebook(id);

    const rows = await getDb()
      .select({
        id: sources.id,
        kind: sources.kind,
        title: sources.title,
        url: sources.url,
        status: sources.status,
        error: sources.error,
        charCount: sources.charCount,
        tokenEstimate: sources.tokenEstimate,
        createdAt: sources.createdAt,
      })
      .from(sources)
      .where(eq(sources.notebookId, notebook.id))
      .orderBy(asc(sources.createdAt));

    return NextResponse.json({ sources: rows });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** Builds the ingestion input from either a file upload or a JSON body. */
async function readInput(
  request: Request,
): Promise<{ kind: Kind; title: string; url: string | null; input: IngestInput }> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw badRequest("No file was uploaded.");
    if (file.size === 0) throw badRequest("That file is empty.");
    if (file.size > MAX_UPLOAD_BYTES) {
      throw badRequest("Files must be smaller than 25 MB.");
    }

    const name = file.name || "Uploaded file";
    const data = new Uint8Array(await file.arrayBuffer());
    const isPdf =
      file.type === "application/pdf" || name.toLowerCase().endsWith(".pdf");

    if (isPdf) {
      return {
        kind: "pdf",
        title: name,
        url: null,
        input: { kind: "pdf", data, filename: name },
      };
    }

    const kind: Kind = /\.(md|markdown)$/i.test(name) ? "markdown" : "text";
    return {
      kind,
      title: name,
      url: null,
      input: { kind, text: new TextDecoder().decode(data), title: name },
    };
  }

  const body = (await request.json().catch(() => {
    throw badRequest("Expected a JSON body or a file upload.");
  })) as { kind?: string; text?: string; url?: string; title?: string };

  if (body.kind === "text" || body.kind === "markdown") {
    if (!body.text?.trim()) throw badRequest("There is no text to add.");
    return {
      kind: body.kind,
      title: body.title?.trim() || "Pasted text",
      url: null,
      input: { kind: body.kind, text: body.text, title: body.title?.trim() },
    };
  }

  const url = body.url?.trim();
  if (!url) throw badRequest("A URL is required.");

  // A YouTube link pasted into the generic URL field should still get the
  // transcript treatment rather than being scraped as a web page.
  const isYouTube = body.kind === "youtube" || parseVideoId(url) !== null;
  if (isYouTube && !parseVideoId(url)) {
    throw badRequest("That does not look like a YouTube video URL.");
  }

  return isYouTube
    ? { kind: "youtube", title: url, url, input: { kind: "youtube", url } }
    : { kind: "web", title: url, url, input: { kind: "web", url } };
}

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/notebooks/[id]/sources">,
) {
  try {
    const { id } = await ctx.params;
    const notebook = await requireOwnedNotebook(id);
    const { kind, title, url, input } = await readInput(request);

    const [created] = await getDb()
      .insert(sources)
      .values({ notebookId: notebook.id, kind, title, url, status: "pending" })
      .returning({ id: sources.id });

    // Ingestion records its own success or failure on the row, so a failure
    // here still returns 200 with a source the UI can show as failed.
    await ingestSource(created.id, input);

    const [source] = await getDb()
      .select()
      .from(sources)
      .where(eq(sources.id, created.id));

    return NextResponse.json(
      { source: { ...source, fullText: undefined } },
      { status: 201 },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
