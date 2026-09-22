import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { handleRouteError, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { notebooks } from "@/lib/db/schema";
import { requireVisitorId } from "@/lib/session-server";

import { instrument } from "@/lib/observability/http";
async function handleGET() {
  try {
    const visitorId = await requireVisitorId();
    const rows = await getDb()
      .select()
      .from(notebooks)
      .where(eq(notebooks.ownerId, visitorId))
      .orderBy(desc(notebooks.updatedAt));

    return NextResponse.json({ notebooks: rows });
  } catch (error) {
    return handleRouteError(error);
  }
}

async function handlePOST(request: Request) {
  try {
    const visitorId = await requireVisitorId();
    const body = await readJson<{ title?: string; emoji?: string }>(request);

    const [notebook] = await getDb()
      .insert(notebooks)
      .values({
        ownerId: visitorId,
        title: body.title?.trim() || "Untitled notebook",
        ...(body.emoji ? { emoji: body.emoji } : {}),
      })
      .returning();

    return NextResponse.json({ notebook }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export const GET = instrument("/api/notebooks", handleGET);
export const POST = instrument("/api/notebooks", handlePOST);
