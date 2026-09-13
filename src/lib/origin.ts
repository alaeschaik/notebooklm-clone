/** Proxies may chain and append, so a forwarded header can carry a list. */
function first(value: string | null): string | null {
  return value?.split(",")[0]?.trim() || null;
}

function isLoopback(host: string): boolean {
  return /^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(host);
}

/**
 * Builds the request origin from headers. Share links are made from this, so
 * behind a reverse proxy it has to reflect the public address rather than the
 * container's. Nginx Proxy Manager sets `Host` and `X-Forwarded-Proto`;
 * `X-Forwarded-Host` is honoured first for proxies that rewrite `Host`.
 */
export function originFromHeaders(
  get: (name: string) => string | null,
): string {
  const host = first(get("x-forwarded-host")) ?? first(get("host")) ?? "localhost:3000";
  // Assume TLS unless told otherwise, since only local development is plain
  // HTTP — guessing wrong the other way hands out unreachable links.
  const protocol = first(get("x-forwarded-proto")) ?? (isLoopback(host) ? "http" : "https");

  return `${protocol}://${host}`;
}
