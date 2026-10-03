import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimit: vi.fn(async () => undefined) }));
vi.mock("@/lib/security/audit", () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock("@/lib/security/totp", () => ({ verifyTotpCode: vi.fn((_secret: string, code: string) => code === "123456") }));
vi.mock("@/lib/auth/session", () => ({ requireUser: vi.fn(async () => ({ id: "u1", twoFactorEnabled: true, twoFactorSecret: "SECRET" })) }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { user: { update: vi.fn(async () => ({})) } } }));

import { prisma } from "@/lib/db/prisma";
import { POST } from "@/app/api/auth/2fa/disable/route";

const disable = (body?: object) =>
  POST(new Request("http://localhost/api/auth/2fa/disable", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) }));

beforeEach(() => vi.mocked(prisma.user.update).mockClear());

describe("turning two-factor authentication off", () => {
  it("needs a current authenticator code, not just a session", async () => {
    expect((await disable()).status).toBe(422);
    expect((await disable({ code: "000000" })).status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("turns it off with a valid code", async () => {
    const res = await disable({ code: "123456" });

    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { twoFactorEnabled: false, twoFactorSecret: null } });
  });
});
