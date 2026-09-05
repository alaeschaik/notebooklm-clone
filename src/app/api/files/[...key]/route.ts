import { NextResponse } from "next/server";

import { readLocalFile, usingVercelBlob } from "@/lib/storage";

const CONTENT_TYPES: Record<string, string> = {
  wav: "audio/wav",
  mp3: "audio/mpeg",
};

/**
 * Serves files from the local storage fallback. In production Blob serves its
 * own URLs directly, so this route has nothing to do and refuses.
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/files/[...key]">,
) {
  if (usingVercelBlob()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { key } = await ctx.params;
  const file = await readLocalFile(key.join("/"));
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const extension = key.at(-1)?.split(".").pop() ?? "";
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "content-type": CONTENT_TYPES[extension] ?? "application/octet-stream",
      "content-length": String(file.byteLength),
      "cache-control": "public, max-age=31536000, immutable",
      // Lets the player seek without re-downloading the whole file.
      "accept-ranges": "bytes",
    },
  });
}
