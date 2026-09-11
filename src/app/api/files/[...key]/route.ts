import { NextResponse } from "next/server";

import { readStoredFile } from "@/lib/storage";

const CONTENT_TYPES: Record<string, string> = {
  wav: "audio/wav",
  mp3: "audio/mpeg",
};

/**
 * Serves generated files — currently audio overviews — from the storage
 * directory. Traversal is rejected by the storage layer, which is the only
 * place that turns a key into a path.
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/files/[...key]">,
) {
  const { key } = await ctx.params;
  const file = await readStoredFile(key.join("/"));
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const extension = key.at(-1)?.split(".").pop() ?? "";
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "content-type": CONTENT_TYPES[extension] ?? "application/octet-stream",
      "content-length": String(file.byteLength),
      // Keys embed the generation id, so a given URL's bytes never change.
      "cache-control": "public, max-age=31536000, immutable",
      // Lets the player seek without re-downloading the whole file.
      "accept-ranges": "bytes",
    },
  });
}
