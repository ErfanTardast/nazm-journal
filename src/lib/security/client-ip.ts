/**
 * The client's address as our own reverse proxy saw it. A proxy appends the peer it received the request from
 * to X-Forwarded-For, so the entries a client sends itself come first and can be forged; trust only the
 * entry added by the nearest trusted proxy (TRUSTED_PROXY_HOPS from the right, default 1).
 */
export function clientIp(request: Request): string | null {
  const hops = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS ?? "1") || 1);
  const forwarded = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (forwarded.length) return forwarded[Math.max(0, forwarded.length - hops)];
  return request.headers.get("x-real-ip")?.trim() || null;
}
