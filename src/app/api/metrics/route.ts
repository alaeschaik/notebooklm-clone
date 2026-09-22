import { NextResponse } from "next/server";

import { registry } from "@/lib/observability/metrics";

export const dynamic = "force-dynamic";

/**
 * Prometheus scrape target.
 *
 * Guarded by a bearer token when METRICS_TOKEN is set. The reverse proxy
 * forwards every path on the public hostname, so this endpoint is reachable
 * from the internet — and it exposes route names, traffic volumes and spend.
 * Left open only when no token is configured, which is the local case.
 */
export async function GET(request: Request) {
  const expected = process.env.METRICS_TOKEN;

  if (expected) {
    const offered = request.headers.get("authorization");
    if (offered !== `Bearer ${expected}`) {
      // 404 rather than 401: an unauthenticated caller learns nothing about
      // whether there is anything here to find.
      return new NextResponse("Not found", { status: 404 });
    }
  }

  return new NextResponse(await registry.metrics(), {
    headers: {
      "content-type": registry.contentType,
      "cache-control": "no-store",
    },
  });
}
