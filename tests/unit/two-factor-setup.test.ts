import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: { id: "u1", email: "u@example.com", twoFactorEnabled: true, twoFactorSecret: "SECRET" } }));

vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimit: vi.fn(async () => undefined) }));
vi.mock("@/lib/security/audit", () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock("@/lib/security/totp", () => ({
  verifyTotpCode: vi.fn((_secret: string, code: string) => code === "123456"),
  generateTotpSecret: vi.fn(() => "NEWSECRET"),
  makeOtpAuthUrl: vi.fn(() => "otpauth://totp/x")
}));
vi.mock("@/lib/auth/session", () => ({ requireUser: vi.fn(async () => session.user) }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { user: { update: vi.fn(async () => ({})) } } }));

import { prisma } from "@/lib/db/prisma";
import { POST } from "@/app/api/auth/2fa/setup/route";

const setup = (body?: object) =>
  POST(
    new Request("http://localhost/api/auth/2fa/setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    })
  );

beforeEach(() => vi.mocked(prisma.user.update).mockClear());

describe("setting up two-factor authentication again while it is on", () => {
  it("needs a current authenticator code: a session alone must not replace or switch off the second factor", async () => {
    session.user = { ...session.user, twoFactorEnabled: true };

    expect((await setup()).status).toBe(422);
    expect((await setup({ code: "000000" })).status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("issues a new secret with a valid code", async () => {
    session.user = { ...session.user, twoFactorEnabled: true };

    const res = await setup({ code: "123456" });

    expect(res.status).toBe(200);
    expect((await res.json()).data.secret).toBe("NEWSECRET");
  });

  it("needs no code for a first setup", async () => {
    session.user = { ...session.user, twoFactorEnabled: false, twoFactorSecret: "" };

    expect((await setup()).status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalled();
  });
});
