import { NextResponse } from "next/server";

import { registry } from "@/lib/observability/metrics";

export const dynamic = "force-dynamic";

/**
 * Prometheus scrape target.
 *
 * Left unauthenticated because it is only reachable on the internal Docker
 * network — the reverse proxy never forwards it. If it were ever exposed, the
 * route names and spend figures here would be worth a token.
 */
export async function GET() {
  return new NextResponse(await registry.metrics(), {
    headers: { "content-type": registry.contentType },
  });
}
