import { NextResponse } from "next/server";

import { getPool } from "@/lib/db";

import { logger } from "@/lib/observability/logger";

const log = logger("health");

export const dynamic = "force-dynamic";

/**
 * Liveness plus a real database round-trip. A container that is accepting
 * connections but cannot reach Postgres is not healthy, and reporting it as
 * such is what makes `depends_on: service_healthy` meaningful.
 */
export async function GET() {
  try {
    await getPool().query("select 1");
    return NextResponse.json({
      status: "ok",
      database: "up",
      revision: process.env.GIT_REVISION ?? "unknown",
    });
  } catch (error) {
    log.error("database unreachable", { error });
    return NextResponse.json(
      {
        status: "degraded",
        database: "down",
        revision: process.env.GIT_REVISION ?? "unknown",
      },
      { status: 503 },
    );
  }
}
