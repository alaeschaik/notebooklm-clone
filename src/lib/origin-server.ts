import { headers } from "next/headers";

import { originFromHeaders } from "./origin";

/**
 * Request origin, read server-side. Client components are server-rendered
 * first, where `window` does not exist, and deferring to an effect would
 * render one value on the server and another after hydration.
 */
export async function getOrigin(): Promise<string> {
  const list = await headers();
  return originFromHeaders((name) => list.get(name));
}
