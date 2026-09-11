import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Rendered audio needs somewhere to live that is not the database — a few
 * minutes of PCM-derived WAV is megabytes, which is the wrong shape for a row.
 *
 * Files go to a directory on disk, which in the container is a mounted volume
 * so audio survives a rebuild. Everything is addressed by key; callers never
 * construct paths themselves.
 */
const ROOT = path.resolve(process.env.STORAGE_DIR ?? path.join(process.cwd(), ".data", "blobs"));

/**
 * Resolves a key to a path inside the storage root, refusing anything that
 * escapes it. Keys embed ids the caller supplies, so this is the one place
 * that has to be certain about traversal.
 */
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
