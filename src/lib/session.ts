import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "nb_sid";

/** A year — notebooks are anonymous, so losing the cookie loses the work. */
const SESSION_MAX_AGE = 60 * 60 * 24 * 365;

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) {
    throw new Error(
      "SESSION_SECRET is not set. Copy .env.example to .env.local and set a long random string.",
    );
  }
  return value;
}

function sign(visitorId: string): string {
  return createHmac("sha256", secret()).update(visitorId).digest("base64url");
}

/**
 * Visitors are anonymous but their notebooks must stay private to them, so the
 * id is signed. Without a signature the cookie is a bare id that anyone could
 * edit to read someone else's notebooks.
 */
export function issueSessionCookie(): { visitorId: string; value: string } {
  const visitorId = randomUUID();
  return { visitorId, value: `${visitorId}.${sign(visitorId)}` };
}

export function readSessionCookie(value: string | undefined): string | null {
  if (!value) return null;

  const separator = value.lastIndexOf(".");
  if (separator <= 0) return null;

  const visitorId = value.slice(0, separator);
  const provided = Buffer.from(value.slice(separator + 1));
  const expected = Buffer.from(sign(visitorId));

  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  return visitorId;
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  maxAge: SESSION_MAX_AGE,
  secure: process.env.NODE_ENV === "production",
} as const;
