import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimit: vi.fn(async () => undefined) }));
vi.mock("@/lib/security/audit", () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock("@/lib/security/password", () => ({ hashPassword: vi.fn(async () => "hash") }));
vi.mock("@/lib/auth/session", () => ({
  createSession: vi.fn(async () => ({ token: "t", expiresAt: new Date() })),
  applySessionCookie: vi.fn(),
  publicUser: (user: unknown) => user
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(async () => null), create: vi.fn(async (args?: { data?: object }) => ({ id: "u1", roles: [], ...args?.data })) },
    role: { upsert: vi.fn(async () => ({ id: "r1", name: "trader" })) },
    userRole: { create: vi.fn(async () => ({})) }
  }
}));

import { prisma } from "@/lib/db/prisma";
import { POST } from "@/app/api/auth/register/route";

const register = (body: object) =>
  POST(new Request("http://localhost/api/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
const account = { email: "friend@example.com", name: "Friend", password: "LongEnough123" };

beforeEach(() => vi.mocked(prisma.user.create).mockClear());
afterEach(() => vi.unstubAllEnvs());

describe("the language the person signed up in", () => {
  it("is stored as the account's language", async () => {
    const res = await register({ ...account, locale: "fa" });

    expect(res.status).toBeLessThan(300);
    expect(vi.mocked(prisma.user.create).mock.calls[0][0].data).toMatchObject({ locale: "fa" });
  });

  it("falls back to the database default when the request carries none", async () => {
    await register(account);

    expect(vi.mocked(prisma.user.create).mock.calls[0][0].data).not.toHaveProperty("locale");
  });

  it("refuses a language the app does not have", async () => {
    const res = await register({ ...account, locale: "de" });

    expect(res.status).toBe(422);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});

describe("registration during an invite-only trial", () => {
  it("refuses a sign-up without the invite code", async () => {
    vi.stubEnv("REGISTRATION_INVITE_CODE", "trial-2026");

    const res = await register(account);

    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("INVITE_REQUIRED");
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("refuses a wrong invite code", async () => {
    vi.stubEnv("REGISTRATION_INVITE_CODE", "trial-2026");

    expect((await register({ ...account, inviteCode: "guess" })).status).toBe(403);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("accepts the invite code, ignoring surrounding spaces", async () => {
    vi.stubEnv("REGISTRATION_INVITE_CODE", "trial-2026");

    const res = await register({ ...account, inviteCode: " trial-2026 " });

    expect(res.status).toBeLessThan(300);
    expect(prisma.user.create).toHaveBeenCalled();
  });

  it("needs no code outside production when no invite code is configured", async () => {
    const res = await register(account);

    expect(res.status).toBeLessThan(300);
    expect(prisma.user.create).toHaveBeenCalled();
  });

  it("stays closed in production when the invite code is missing or blank (a forgotten variable must not open sign-up)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const value of [undefined, "", "   "]) {
      if (value === undefined) delete process.env.REGISTRATION_INVITE_CODE;
      else vi.stubEnv("REGISTRATION_INVITE_CODE", value);

      const res = await register({ ...account, inviteCode: "anything" });

      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe("REGISTRATION_CLOSED");
    }
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("opens sign-up in production only when REGISTRATION_OPEN=true is set on purpose", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REGISTRATION_OPEN", "true");

    const res = await register(account);

    expect(res.status).toBeLessThan(300);
    expect(prisma.user.create).toHaveBeenCalled();
  });

  it("still requires the code in production when both a code and REGISTRATION_OPEN are set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REGISTRATION_OPEN", "true");
    vi.stubEnv("REGISTRATION_INVITE_CODE", "trial-2026");

    expect((await register(account)).status).toBe(403);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});
