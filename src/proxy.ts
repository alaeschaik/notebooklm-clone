import { NextResponse, type NextRequest } from "next/server";

import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  issueSessionCookie,
  readSessionCookie,
} from "@/lib/session";

/**
 * Mints an anonymous session on first visit so a reviewer can open the app and
 * start working immediately — no signup, but still one private workspace each.
 *
 * The cookie is written onto the *request* as well as the response so that the
 * server components rendering this very request already see it, instead of
 * everyone's first page load being session-less.
 */
export function proxy(request: NextRequest) {
  const existing = readSessionCookie(
    request.cookies.get(SESSION_COOKIE)?.value,
  );
  if (existing) return NextResponse.next();

  const { value } = issueSessionCookie();
  request.cookies.set(SESSION_COOKIE, value);

  const response = NextResponse.next({ request });
  response.cookies.set(SESSION_COOKIE, value, SESSION_COOKIE_OPTIONS);
  return response;
}

export const config = {
  // Skip static assets: they never read the session and would only add latency.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp3|wav)$).*)"],
};
