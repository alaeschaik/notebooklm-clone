import { headers } from "next/headers";

/**
 * The absolute origin of the current request, derived server-side.
 *
 * Client components cannot read `window.location` during render — they are
 * server-rendered first, where `window` does not exist — and reading it in an
 * effect instead would render one value on the server and another after
 * hydration. Taking it from the request headers is deterministic on both sides.
 */
export async function getOrigin(): Promise<string> {
  const list = await headers();
  const host = list.get("x-forwarded-host") ?? list.get("host") ?? "localhost:3000";
  const protocol =
    list.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  return `${protocol}://${host}`;
}
