import { headers } from "next/headers";

/**
 * Request origin, read server-side. Client components are server-rendered
 * first, where `window` does not exist, and deferring to an effect would
 * render one value on the server and another after hydration.
 */
export async function getOrigin(): Promise<string> {
  const list = await headers();
  const host = list.get("x-forwarded-host") ?? list.get("host") ?? "localhost:3000";
  const protocol =
    list.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  return `${protocol}://${host}`;
}
