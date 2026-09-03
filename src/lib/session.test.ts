import { beforeAll, describe, expect, it } from "vitest";

import { issueSessionCookie, readSessionCookie } from "./session";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-value-long-enough-to-be-real";
});

describe("session cookies", () => {
  it("round-trips an issued cookie", () => {
    const { visitorId, value } = issueSessionCookie();
    expect(readSessionCookie(value)).toBe(visitorId);
  });

  it("issues a distinct visitor id each time", () => {
    expect(issueSessionCookie().visitorId).not.toBe(
      issueSessionCookie().visitorId,
    );
  });

  it("rejects a swapped visitor id that keeps a valid-looking signature", () => {
    const { value } = issueSessionCookie();
    const signature = value.slice(value.lastIndexOf(".") + 1);
    // The attack this guards against: claiming another visitor's notebooks by
    // editing the id half of the cookie.
    expect(readSessionCookie(`some-other-visitor.${signature}`)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const { visitorId } = issueSessionCookie();
    expect(readSessionCookie(`${visitorId}.not-a-real-signature`)).toBeNull();
  });

  it("rejects malformed and missing values", () => {
    expect(readSessionCookie(undefined)).toBeNull();
    expect(readSessionCookie("")).toBeNull();
    expect(readSessionCookie("no-separator")).toBeNull();
    expect(readSessionCookie(".only-a-signature")).toBeNull();
  });

  it("rejects a cookie signed with a different secret", () => {
    const { value } = issueSessionCookie();
    process.env.SESSION_SECRET = "a-completely-different-secret-value";
    expect(readSessionCookie(value)).toBeNull();
    process.env.SESSION_SECRET = "test-secret-value-long-enough-to-be-real";
  });
});
