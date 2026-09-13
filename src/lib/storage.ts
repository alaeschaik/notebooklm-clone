import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Rendered audio is megabytes per overview — the wrong shape for a database
 * row. Files go to a directory that is a mounted volume in the container, so
 * they survive a rebuild. Callers address them by key, never by path.
 */
const ROOT = path.resolve(process.env.STORAGE_DIR ?? path.join(process.cwd(), ".data", "blobs"));

/** The one place a key becomes a path, so the one place traversal is checked. */
function resolveKey(key: string): string | null {
  const target = path.resolve(ROOT, key);
  return target === ROOT || target.startsWith(ROOT + path.sep) ? target : null;
}

/** Strips the serving prefix back off a URL produced by {@link putFile}. */
function keyFromUrl(url: string): string {
  return url.replace(/^\/api\/files\//, "");
}

export async function putFile(key: string, data: Uint8Array): Promise<string> {
  const target = resolveKey(key);
  if (!target) throw new Error(`Refusing to write outside the storage root: ${key}`);

  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, data);
  return `/api/files/${key}`;
}

/** Reads back a file by the URL {@link putFile} returned. */
export async function getFile(url: string): Promise<Uint8Array | null> {
  const file = await readStoredFile(keyFromUrl(url));
  return file ? new Uint8Array(file) : null;
}

/** Deletes an intermediate file once it has been folded into a final one. */
export async function deleteFile(url: string): Promise<void> {
  const target = resolveKey(keyFromUrl(url));
  if (target) await rm(target).catch(() => {});
}

/** Reads a stored file by key. Used by the route that serves them. */
export async function readStoredFile(key: string): Promise<Buffer | null> {
  const target = resolveKey(key);
  if (!target) return null;
  return readFile(target).catch(() => null);
}
