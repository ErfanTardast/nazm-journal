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
    role: { upsert: vi.fn(async () => ({ id: "r1", name: "trader" })) }
  }
}));

import { POST } from "@/app/api/auth/register/route";
import { inviteCodeRequired, registrationMode } from "@/lib/auth/registration";

const register = (inviteCode?: string) =>
  POST(
    new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "friend@example.com", name: "Friend", password: "LongEnough123", ...(inviteCode === undefined ? {} : { inviteCode }) })
    })
  );

const NODE_ENVS = ["development", "test", "production"] as const;
const OPEN_FLAGS = [undefined, "true", "false", "TRUE", "1", " true", ""] as const;
const CODES = [undefined, "", "   ", "trial-2026", "  trial-2026  "] as const;
const NAMES = ["NODE_ENV", "REGISTRATION_OPEN", "REGISTRATION_INVITE_CODE"] as const;

const saved: Record<string, string | undefined> = {};
function setEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else (process.env as Record<string, string | undefined>)[name] = value;
}

beforeEach(() => {
  for (const name of NAMES) saved[name] = process.env[name];
});
afterEach(() => {
  for (const name of NAMES) setEnv(name, saved[name]);
});

describe("registrationMode", () => {
  it("is invite while a non-blank invite code is set, whatever else is set", () => {
    expect(registrationMode({ REGISTRATION_INVITE_CODE: "trial-2026" })).toBe("invite");
    expect(registrationMode({ REGISTRATION_INVITE_CODE: "  trial-2026 ", NODE_ENV: "production" })).toBe("invite");
    expect(registrationMode({ REGISTRATION_INVITE_CODE: "trial-2026", NODE_ENV: "production", REGISTRATION_OPEN: "true" })).toBe("invite");
  });

  it("is open outside production and in production only on REGISTRATION_OPEN=true", () => {
    expect(registrationMode({})).toBe("open");
    expect(registrationMode({ NODE_ENV: "development" })).toBe("open");
    expect(registrationMode({ NODE_ENV: "test", REGISTRATION_INVITE_CODE: "  " })).toBe("open");
    expect(registrationMode({ NODE_ENV: "production", REGISTRATION_OPEN: "true" })).toBe("open");
  });

  it("is closed in production with no code unless REGISTRATION_OPEN is exactly true (a forgotten variable must not open sign-up)", () => {
    expect(registrationMode({ NODE_ENV: "production" })).toBe("closed");
    expect(registrationMode({ NODE_ENV: "production", REGISTRATION_INVITE_CODE: "   " })).toBe("closed");
    for (const flag of ["false", "TRUE", "1", " true", ""]) {
      expect(registrationMode({ NODE_ENV: "production", REGISTRATION_OPEN: flag })).toBe("closed");
    }
  });

  it("reads process.env when no environment is passed", () => {
    setEnv("NODE_ENV", "production");
    setEnv("REGISTRATION_OPEN", undefined);
    setEnv("REGISTRATION_INVITE_CODE", undefined);
    expect(registrationMode()).toBe("closed");
    setEnv("REGISTRATION_OPEN", "true");
    expect(registrationMode()).toBe("open");
    setEnv("REGISTRATION_INVITE_CODE", "x");
    expect(registrationMode()).toBe("invite");
  });

  it("keeps inviteCodeRequired true exactly in the invite mode", () => {
    for (const env of [{}, { REGISTRATION_INVITE_CODE: "x" }, { NODE_ENV: "production" }, { NODE_ENV: "production", REGISTRATION_OPEN: "true" }, { REGISTRATION_INVITE_CODE: " " }]) {
      expect(inviteCodeRequired(env)).toBe(registrationMode(env) === "invite");
    }
  });
});

// The page tells a visitor what the sign-up API will do, so the mode must agree with the route for every setting.
describe("registrationMode against what POST /api/auth/register does", () => {
  const combos = NODE_ENVS.flatMap((nodeEnv) => OPEN_FLAGS.flatMap((open) => CODES.map((code) => ({ nodeEnv, open, code }))));
  const label = ({ nodeEnv, open, code }: (typeof combos)[number]) => `NODE_ENV=${nodeEnv} REGISTRATION_OPEN=${JSON.stringify(open)} REGISTRATION_INVITE_CODE=${JSON.stringify(code)}`;

  it("covers every combination", () => {
    expect(combos).toHaveLength(NODE_ENVS.length * OPEN_FLAGS.length * CODES.length);
  });

  it.each(combos)("agrees with the route: %j", async (combo) => {
    setEnv("NODE_ENV", combo.nodeEnv);
    setEnv("REGISTRATION_OPEN", combo.open);
    setEnv("REGISTRATION_INVITE_CODE", combo.code);
    const mode = registrationMode();
    expect(["invite", "open", "closed"], label(combo)).toContain(mode);

    const noCode = await register();
    const wrongCode = await register("not-the-code");
    const rightCode = await register(combo.code?.trim() || "any-code-at-all");

    if (mode === "invite") {
      expect(noCode.status, label(combo)).toBe(403);
      expect((await noCode.json()).error.code).toBe("INVITE_REQUIRED");
      expect(wrongCode.status, label(combo)).toBe(403);
      expect((await wrongCode.json()).error.code).toBe("INVITE_REQUIRED");
      expect(rightCode.status, label(combo)).toBeLessThan(300);
    } else if (mode === "open") {
      expect(noCode.status, label(combo)).toBeLessThan(300);
      expect(wrongCode.status, label(combo)).toBeLessThan(300);
      expect(rightCode.status, label(combo)).toBeLessThan(300);
    } else {
      for (const response of [noCode, wrongCode, rightCode]) {
        expect(response.status, label(combo)).toBe(403);
        expect((await response.json()).error.code).toBe("REGISTRATION_CLOSED");
      }
    }
  });
});
