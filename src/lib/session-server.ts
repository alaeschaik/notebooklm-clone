import { cookies } from "next/headers";

import { SESSION_COOKIE, readSessionCookie } from "./session";

/**
 * Resolves the current anonymous visitor. `proxy` guarantees a signed cookie
 * exists on every non-asset request, so a miss here means a tampered or expired
 * value and is treated as "not signed in".
 */
export async function getVisitorId(): Promise<string | null> {
  const store = await cookies();
  return readSessionCookie(store.get(SESSION_COOKIE)?.value);
}

/** Same as {@link getVisitorId} but throws, for routes that cannot proceed. */
export async function requireVisitorId(): Promise<string> {
  const visitorId = await getVisitorId();
  if (!visitorId) throw new UnauthorizedError();
  return visitorId;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("No valid session cookie");
    this.name = "UnauthorizedError";
  }
}
