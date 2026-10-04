// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimit: vi.fn(async () => undefined) }));
vi.mock("@/lib/security/audit", () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { user: { findUnique: vi.fn(), create: vi.fn() } } }));

import { prisma } from "@/lib/db/prisma";
import { BODY_LIMITS } from "@/lib/api/body-limits";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as register } from "@/app/api/auth/register/route";

// SECURITY.md says request bodies have size limits. A route anyone can call without signing in must not read a body
// of any size (on 2026-10-04 only 1 of 10 such routes set one), and the import keeps a limit its largest valid file fits.

const API = join(process.cwd(), "src/app/api");
const routeFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return name === "route.ts" ? [path] : [];
  });
const relative = (path: string) => path.slice(process.cwd().length + 1).split("\\").join("/");

describe("request body limits", () => {
  afterEach(() => vi.clearAllMocks());

  it("every route that reads a body without a session sets maxBytes", () => {
    const missing = routeFiles(API)
      .map((path) => ({ path: relative(path), source: readFileSync(path, "utf8") }))
      .filter(({ source }) => /readJson\(/.test(source) && !/require(User|AdminUser|Permission)\(/.test(source))
      .filter(({ source }) => [...source.matchAll(/readJson\(([^;]*)\)/g)].some(([call]) => !/maxBytes/.test(call)))
      .map(({ path }) => path);
    expect(missing).toEqual([]);
  });

  it("the trade import sets maxBytes too", () => {
    expect(readFileSync(join(API, "trades/import/route.ts"), "utf8")).toMatch(/readJson\([^;]*maxBytes: BODY_LIMITS\.tradeImport/);
  });

  it("refuses an oversized sign-in or sign-up body with 413 before touching the database", async () => {
    const huge = JSON.stringify({ email: "a@example.com", password: "x".repeat(BODY_LIMITS.auth) });
    for (const handler of [login, register]) {
      const response = await handler(
        new Request("http://localhost/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: huge })
      );
      expect(response.status).toBe(413);
    }
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("leaves room for the largest valid bodies", () => {
    const bytes = (body: object) => Buffer.byteLength(JSON.stringify(body));
    // Every field at its schema maximum, in 4-byte characters where the field allows any text.
    const widest = "\u{1F600}";
    expect(
      bytes({ name: widest.repeat(80), email: `${"a".repeat(64)}@${"b".repeat(185)}.com`, password: widest.repeat(128), inviteCode: widest.repeat(128), locale: "fa" })
    ).toBeLessThan(BODY_LIMITS.auth);
    expect(bytes({ token: "t".repeat(256), password: widest.repeat(128) })).toBeLessThan(BODY_LIMITS.auth);
    // The import schema allows 500,000 characters of CSV; Persian and the half-space are 2-3 bytes in UTF-8.
    const persianCsv = "\u200c".repeat(500_000);
    expect(bytes({ csv: persianCsv, filename: "x".repeat(255), timeZone: "America/Argentina/ComodRivadavia", mapping: {} })).toBeLessThan(
      BODY_LIMITS.tradeImport
    );
  });
});
