import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Rendered audio needs somewhere to live that is not the database — a few
 * minutes of PCM-derived WAV is megabytes, which is the wrong shape for a row.
 *
 * On Vercel that is Blob storage. Locally there is no Blob token, so files go
 * to a gitignored directory and are served back by an API route. Same contract
 * either way: put bytes, get a URL.
 */
const LOCAL_DIR = path.join(process.cwd(), ".data", "blobs");

export function usingVercelBlob(): boolean {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  // .env.example ships a placeholder; treating it as real produces a
  // "this store does not exist" failure at the very end of a long job.
  return Boolean(token) && !token!.endsWith("...");
}

export async function putFile(
  key: string,
  data: Uint8Array,
  contentType: string,
): Promise<string> {
  if (usingVercelBlob()) {
    const { put } = await import("@vercel/blob");
    const blob = await put(key, Buffer.from(data), {
      access: "public",
      contentType,
      // Keys already contain a generated id, so the random suffix would only
      // make the URL harder to reason about.
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return blob.url;
  }

  const target = path.join(LOCAL_DIR, key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, data);
  return `/api/files/${key}`;
}

/**
 * Reads back something written by {@link putFile}, given the URL it returned.
 * Intermediate audio segments are written and re-read across separate
 * requests, so this has to work for both backends.
 */
export async function getFile(url: string): Promise<Uint8Array | null> {
  if (/^https?:\/\//.test(url)) {
    const response = await fetch(url);
    if (!response.ok) return null;
    return new Uint8Array(await response.arrayBuffer());
  }

  const key = url.replace(/^\/api\/files\//, "");
  const file = await readLocalFile(key);
  return file ? new Uint8Array(file) : null;
}

/** Deletes an intermediate file once it has been folded into the final audio. */
export async function deleteFile(url: string): Promise<void> {
  if (/^https?:\/\//.test(url)) {
    const { del } = await import("@vercel/blob");
    await del(url).catch(() => {});
    return;
  }
  const key = url.replace(/^\/api\/files\//, "");
  const target = path.resolve(LOCAL_DIR, key);
  if (target.startsWith(path.resolve(LOCAL_DIR) + path.sep)) {
    await rm(target).catch(() => {});
  }
}

/** Reads a locally stored file. Only used by the development file route. */
export async function readLocalFile(key: string): Promise<Buffer | null> {
  // Contain the path: a traversing key must not escape the storage directory.
  const target = path.resolve(LOCAL_DIR, key);
  if (!target.startsWith(path.resolve(LOCAL_DIR) + path.sep)) return null;

  return readFile(target).catch(() => null);
}
