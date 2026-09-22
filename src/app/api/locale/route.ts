import { NextResponse } from "next/server";

import { LOCALE_COOKIE, isLocale } from "@/lib/i18n/dictionaries";

import { instrument } from "@/lib/observability/http";
/**
 * Language lives in a cookie rather than the URL. The alternative — locale
 * path segments — would mean every notebook has two addresses, which breaks
 * the share links this app hands out.
 */
async function handlePOST(request: Request) {
  const { locale } = (await request.json().catch(() => ({}))) as {
    locale?: unknown;
  };
  if (!isLocale(locale)) {
    return NextResponse.json({ error: "Unsupported locale." }, { status: 400 });
  }

  const response = NextResponse.json({ locale });
  response.cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return response;
}

export const POST = instrument("/api/locale", handlePOST);
