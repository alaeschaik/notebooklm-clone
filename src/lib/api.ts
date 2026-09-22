import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { notebooks, sources } from "@/lib/db/schema";
import { UnauthorizedError, getVisitorId } from "@/lib/session-server";

import { logger } from "@/lib/observability/logger";

const log = logger("api");

/** An error whose message is safe and useful to show the user. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const badRequest = (message: string) => new ApiError(400, message);
export const notFound = (message = "Not found") => new ApiError(404, message);

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Ids reach the database from request bodies and URLs. Rejecting non-UUIDs up
 * front turns a confusing Postgres cast error into a clear 400.
 */
export function assertUuid(value: unknown, label = "id"): string {
  if (typeof value !== "string" || !UUID.test(value)) {
    throw badRequest(`Invalid ${label}.`);
  }
  return value;
}

export function assertUuids(value: unknown, label = "ids"): string[] {
  if (!Array.isArray(value)) throw badRequest(`Invalid ${label}.`);
  return value.map((item) => assertUuid(item, label));
}

/**
 * Loads a notebook the current visitor owns. Ownership is enforced in the same
 * query as the lookup so a wrong owner is indistinguishable from a missing
 * notebook — there is no way to probe for other people's notebook ids.
 */
export async function requireOwnedNotebook(notebookId: string) {
  const visitorId = await getVisitorId();
  if (!visitorId) throw new UnauthorizedError();

  const [notebook] = await getDb()
    .select()
    .from(notebooks)
    .where(
      and(eq(notebooks.id, assertUuid(notebookId, "notebook id")), eq(notebooks.ownerId, visitorId)),
    );

  if (!notebook) throw notFound("Notebook not found.");
  return notebook;
}

/** Loads a source, proving ownership through its notebook in the same query. */
export async function requireOwnedSource(sourceId: string) {
  const visitorId = await getVisitorId();
  if (!visitorId) throw new UnauthorizedError();

  const [row] = await getDb()
    .select({ source: sources, notebook: notebooks })
    .from(sources)
    .innerJoin(notebooks, eq(sources.notebookId, notebooks.id))
    .where(
      and(
        eq(sources.id, assertUuid(sourceId, "source id")),
        eq(notebooks.ownerId, visitorId),
      ),
    );

  if (!row) throw notFound("Source not found.");
  return row;
}

export function handleRouteError(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof UnauthorizedError) {
    return NextResponse.json(
      { error: "Your session has expired. Reload the page to start a new one." },
      { status: 401 },
    );
  }

  log.error("unhandled error", { error });
  return NextResponse.json(
    { error: "Something went wrong. Please try again." },
    { status: 500 },
  );
}

/** Parses a JSON body, turning malformed input into a 400 rather than a 500. */
export async function readJson<T = Record<string, unknown>>(
  request: Request,
): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw badRequest("Expected a JSON body.");
  }
}
