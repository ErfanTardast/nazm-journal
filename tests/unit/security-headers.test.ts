import { afterEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../../next.config";

afterEach(() => vi.unstubAllEnvs());

async function headersFor(nodeEnv: string) {
  vi.stubEnv("NODE_ENV", nodeEnv);
  const rules = (await nextConfig.headers?.()) ?? [];
  const all = rules.find((rule) => rule.source === "/:path*");
  return Object.fromEntries((all?.headers ?? []).map((header) => [header.key, header.value]));
}

describe("security headers", () => {
  it("are sent on every page and API response", async () => {
    const headers = await headersFor("development");

    expect(headers).toMatchObject({
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin"
    });
    expect(headers["Permissions-Policy"]).toContain("camera=()");
  });

  it("add HSTS only in production (HTTPS)", async () => {
    expect(await headersFor("development")).not.toHaveProperty("Strict-Transport-Security");
    expect((await headersFor("production"))["Strict-Transport-Security"]).toMatch(/max-age=\d+/);
  });
});

// Audit round 3: the 111 KB Persian font came from /public with `max-age=0`, so every page load (and the full reload
// a language switch causes) revalidated it. The file name is versioned, so it can be cached for a year.
describe("font caching", () => {
  async function fontRule() {
    const rules = (await nextConfig.headers?.()) ?? [];
    return rules.find((rule) => rule.source === "/fonts/:path*");
  }

  it("serves /fonts as an immutable year-long asset", async () => {
    const rule = await fontRule();
    expect(rule, "next.config.ts needs a /fonts/:path* headers rule").toBeDefined();
    const cache = rule?.headers.find((header) => header.key === "Cache-Control");
    expect(cache?.value).toBe("public, max-age=31536000, immutable");
  });

  it("keeps the security headers on every path, fonts included", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const all = rules.filter((rule) => rule.source === "/:path*");
    expect(all).toHaveLength(1);
    const keys = all[0].headers.map((header) => header.key);
    expect(keys).toEqual(expect.arrayContaining(["X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy"]));
    // The font rule only adds caching: it must not replace or clear the security headers for that path.
    const fontKeys = (await fontRule())?.headers.map((header) => header.key) ?? [];
    expect(fontKeys).not.toContain("X-Content-Type-Options");
  });

  it("does not make anything but fonts immutable", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    for (const rule of rules.filter((candidate) => candidate.source !== "/fonts/:path*")) {
      expect(rule.headers.map((header) => header.value).join(" ")).not.toContain("immutable");
    }
  });
});
