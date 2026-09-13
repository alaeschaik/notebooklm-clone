import { describe, expect, it } from "vitest";

import { originFromHeaders } from "./origin";

const from = (headers: Record<string, string>) =>
  originFromHeaders((name) => headers[name] ?? null);

describe("originFromHeaders", () => {
  it("uses the host directly when nothing is proxied", () => {
    expect(from({ host: "notebook.example.com" })).toBe(
      "https://notebook.example.com",
    );
  });

  it("keeps local development on http", () => {
    expect(from({ host: "localhost:3000" })).toBe("http://localhost:3000");
    expect(from({ host: "127.0.0.1:3000" })).toBe("http://127.0.0.1:3000");
  });

  it("assumes https for a real hostname", () => {
    // Guessing http would hand out links that redirect or fail outright;
    // guessing https is wrong only in setups that are already broken.
    expect(from({ host: "notebook.example.com" })).toMatch(/^https:/);
  });

  it("honours the forwarded protocol", () => {
    expect(
      from({ host: "notebook.example.com", "x-forwarded-proto": "http" }),
    ).toBe("http://notebook.example.com");
  });

  it("prefers the forwarded host when the proxy rewrote Host", () => {
    expect(
      from({
        host: "10.0.0.5:3000",
        "x-forwarded-host": "notebook.example.com",
        "x-forwarded-proto": "https",
      }),
    ).toBe("https://notebook.example.com");
  });

  it("takes the first value when proxies chain", () => {
    // Two proxies in front of each other append rather than replace.
    expect(
      from({
        host: "internal",
        "x-forwarded-host": "notebook.example.com, internal.lan",
        "x-forwarded-proto": "https, http",
      }),
    ).toBe("https://notebook.example.com");
  });

  it("reproduces what Nginx Proxy Manager sends", () => {
    // NPM sets Host and X-Forwarded-Proto but not X-Forwarded-Host, so the
    // fallback to Host is the path that actually runs in production.
    expect(
      from({ host: "notebook.example.com", "x-forwarded-proto": "https" }),
    ).toBe("https://notebook.example.com");
  });

  it("falls back when no host header arrives at all", () => {
    expect(from({})).toBe("http://localhost:3000");
  });
});
