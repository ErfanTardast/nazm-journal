import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  demo: { on: false },
  prisma: {
    user: { update: vi.fn() },
    session: { deleteMany: vi.fn(), create: vi.fn() },
    passwordResetToken: { updateMany: vi.fn() },
    $transaction: vi.fn()
  }
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn(),
  applySessionCookie: vi.fn()
}));
vi.mock("@/lib/security/password", () => ({ hashPassword: vi.fn(), verifyPassword: vi.fn() }));
vi.mock("@/lib/security/audit", () => ({ auditLog: vi.fn() }));
vi.mock("@/lib/demo", () => ({ demoModeEnabled: () => mocks.demo.on }));
// The real limiter (in-memory here), wrapped so a test can also see how it was called.
vi.mock("@/lib/security/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security/rate-limit")>();
  return { enforceRateLimit: vi.fn(actual.enforceRateLimit) };
});

import { POST } from "@/app/api/users/me/password/route";
import { applySessionCookie, requireUser } from "@/lib/auth/session";
import { unauthorized } from "@/lib/api/errors";
import { auditLog } from "@/lib/security/audit";
import { hashPassword, verifyPassword } from "@/lib/security/password";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { hashToken, verifySignedCookieValue } from "@/lib/security/tokens";

const CURRENT = "OldPassword123!";
const NEXT = "NewPassword456!";
const prisma = mocks.prisma;

/** What each database call hands to `$transaction` (a real client returns a lazy query there): lets a test see what ran together. */
const queries = {
  updateUser: { query: "user.update" },
  deleteSessions: { query: "session.deleteMany" },
  createSession: { query: "session.create" },
  useResetTokens: { query: "passwordResetToken.updateMany" }
};

let addressCounter = 0;
let userCounter = 0;
let user: { id: string; email: string; passwordHash: string };

/**
 * Every request comes from its own address unless a test pins one, so the per-address limit never leaks between tests.
 * `address: null` sends no forwarded address at all.
 */
function request(body: unknown, init: { address?: string | null; contentType?: string } = {}) {
  const headers: Record<string, string> = { "content-type": init.contentType ?? "application/json", "user-agent": "vitest" };
  if (init.address !== null) headers["x-forwarded-for"] = init.address ?? `10.0.0.${++addressCounter}`;
  return new Request("http://localhost/api/users/me/password", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers
  });
}

/** Lets other requests run while a password check is "busy", as a real bcrypt compare does. */
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

const change = (overrides: Record<string, unknown> = {}, init?: Parameters<typeof request>[1]) =>
  request({ currentPassword: CURRENT, newPassword: NEXT, ...overrides }, init);

function expectNothingWritten() {
  expect(prisma.$transaction).not.toHaveBeenCalled();
  expect(prisma.user.update).not.toHaveBeenCalled();
  expect(prisma.session.deleteMany).not.toHaveBeenCalled();
  expect(prisma.passwordResetToken.updateMany).not.toHaveBeenCalled();
  expect(prisma.session.create).not.toHaveBeenCalled();
  expect(hashPassword).not.toHaveBeenCalled();
  expect(applySessionCookie).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.demo.on = false;
  // A new account per test: the per-account failure counter lives in the process and must not carry over.
  user = { id: `user-${++userCounter}`, email: `person${userCounter}@example.com`, passwordHash: "stored-hash" };
  vi.mocked(requireUser).mockResolvedValue(user as never);
  vi.mocked(verifyPassword).mockImplementation(async (password) => password === CURRENT);
  vi.mocked(hashPassword).mockResolvedValue("new-hash");
  vi.mocked(auditLog).mockResolvedValue(undefined);
  prisma.user.update.mockReturnValue(queries.updateUser);
  prisma.session.deleteMany.mockReturnValue(queries.deleteSessions);
  prisma.session.create.mockReturnValue(queries.createSession);
  prisma.passwordResetToken.updateMany.mockReturnValue(queries.useResetTokens);
  prisma.$transaction.mockImplementation(async (operations: unknown[]) => Promise.all(operations));
});

describe("POST /api/users/me/password", () => {
  describe("signed out", () => {
    it("answers the usual 401 and touches nothing", async () => {
      vi.mocked(requireUser).mockRejectedValue(unauthorized());

      const res = await POST(change());
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.error.code).toBe("UNAUTHORIZED");
      expect(verifyPassword).not.toHaveBeenCalled();
      expect(auditLog).not.toHaveBeenCalled();
      expectNothingWritten();
    });

    it("is rate limited before anyone is looked up", async () => {
      vi.mocked(requireUser).mockRejectedValue(unauthorized());

      await POST(change());

      expect(enforceRateLimit).toHaveBeenCalledWith(expect.any(Request), "users:me:password", 5, 15 * 60);
      expect(vi.mocked(enforceRateLimit).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(requireUser).mock.invocationCallOrder[0]);
    });
  });

  describe("wrong current password", () => {
    it("answers 403 PASSWORD_CHANGE_CURRENT_INVALID and writes nothing", async () => {
      const res = await POST(change({ currentPassword: "not-my-password" }));
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.error.code).toBe("PASSWORD_CHANGE_CURRENT_INVALID");
      expect(verifyPassword).toHaveBeenCalledWith("not-my-password", "stored-hash");
      expectNothingWritten();
    });

    it("keeps every session: no session is deleted and no new cookie is set", async () => {
      await POST(change({ currentPassword: "not-my-password" }));

      expect(prisma.session.deleteMany).not.toHaveBeenCalled();
      expect(applySessionCookie).not.toHaveBeenCalled();
    });

    it("writes the failed-attempt audit entry", async () => {
      await POST(change({ currentPassword: "not-my-password" }));

      expect(auditLog).toHaveBeenCalledTimes(1);
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ userId: user.id, action: "auth.password_change.failed", entity: "User", entityId: user.id, request: expect.any(Request) })
      );
    });
  });

  describe("new password", () => {
    it.each([
      ["too short", "Short1a"],
      ["without an uppercase letter", "newpassword456!"],
      ["without a lowercase letter", "NEWPASSWORD456!"],
      ["without a digit", "NewPasswordOnly!"]
    ])("answers 422 for a new password %s and checks nothing against the account", async (_label, newPassword) => {
      const res = await POST(change({ newPassword }));
      const body = await res.json();

      expect(res.status).toBe(422);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.details.fieldErrors).toHaveProperty("newPassword");
      expect(verifyPassword).not.toHaveBeenCalled();
      expectNothingWritten();
    });

    it("answers 422 PASSWORD_CHANGE_SAME when it equals the current password", async () => {
      const res = await POST(change({ currentPassword: CURRENT, newPassword: CURRENT }));
      const body = await res.json();

      expect(res.status).toBe(422);
      expect(body.error.code).toBe("PASSWORD_CHANGE_SAME");
      expectNothingWritten();
    });

    it("answers 422 PASSWORD_CHANGE_SAME when the two differ only after the first 72 bytes, which is all bcrypt reads", async () => {
      const shared = `Aa1${"x".repeat(69)}`;
      expect(Buffer.byteLength(shared)).toBe(72);
      // A stand-in for bcrypt: a hash is equal for any two passwords that agree on their first 72 bytes.
      const stored = (password: string) => `bcrypt-72:${Buffer.from(password).subarray(0, 72).toString()}`;
      user.passwordHash = stored(`${shared}TAIL-ONE`);
      vi.mocked(verifyPassword).mockImplementation(async (password, hash) => stored(password) === hash);

      const res = await POST(change({ currentPassword: `${shared}TAIL-ONE`, newPassword: `${shared}TAIL-TWO` }));
      const body = await res.json();

      expect(res.status).toBe(422);
      expect(body.error.code).toBe("PASSWORD_CHANGE_SAME");
      expect(verifyPassword).toHaveBeenCalledTimes(2);
      expectNothingWritten();
    });

    it("checks the new password against the stored hash, after the current one was verified", async () => {
      await POST(change());

      expect(verifyPassword).toHaveBeenCalledTimes(2);
      expect(verifyPassword).toHaveBeenNthCalledWith(1, CURRENT, "stored-hash");
      expect(verifyPassword).toHaveBeenNthCalledWith(2, NEXT, "stored-hash");
    });

    it("does not call a wrong current password 'the same' (the current password is checked first)", async () => {
      const res = await POST(change({ currentPassword: NEXT, newPassword: NEXT }));
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.error.code).toBe("PASSWORD_CHANGE_CURRENT_INVALID");
    });

    it("refuses a body larger than 4 KB with 413, before the schema or the password check sees it", async () => {
      const res = await POST(change({ newPassword: `Aa1${"x".repeat(5000)}` }));
      const body = await res.json();

      expect(res.status).toBe(413);
      expect(body.error.code).toBe("PAYLOAD_TOO_LARGE");
      expect(verifyPassword).not.toHaveBeenCalled();
      expectNothingWritten();
    });

    it("still takes the longest password the rules allow (128 characters)", async () => {
      const longest = `Aa1${"x".repeat(125)}`;
      expect(longest).toHaveLength(128);

      expect((await POST(change({ newPassword: longest }))).status).toBe(200);
    });

    it("refuses an unknown key and a body that is not JSON", async () => {
      expect((await POST(change({ extra: true }))).status).toBe(422);
      const res = await POST(change({}, { contentType: "text/plain" }));
      expect(res.status).toBe(415);
      expectNothingWritten();
    });
  });

  describe("success", () => {
    it("stores the new hash, ends every session and uses up the reset tokens in one transaction", async () => {
      const res = await POST(change());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ data: { changed: true } });
      expect(hashPassword).toHaveBeenCalledWith(NEXT);
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: user.id }, data: { passwordHash: "new-hash" } });
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: user.id } });
      expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: expect.any(Date) }
      });
      // All four queries go into the one transaction, so they happen together or not at all. The new session comes
      // after the delete of the old ones, or it would be deleted with them.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const [operations] = prisma.$transaction.mock.calls[0];
      expect(operations).toHaveLength(4);
      expect(operations[0]).toBe(queries.updateUser);
      expect(operations[1]).toBe(queries.deleteSessions);
      expect(operations[2]).toBe(queries.createSession);
      expect(operations[3]).toBe(queries.useResetTokens);
    });

    it("gives this device a fresh session inside that transaction and sets its cookie on the response", async () => {
      const before = Date.now();
      const res = await POST(change({}, { address: "203.0.113.77" }));

      expect(prisma.session.create).toHaveBeenCalledTimes(1);
      const [{ data }] = prisma.session.create.mock.calls[0];
      expect(data).toEqual({
        userId: user.id,
        tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        expiresAt: expect.any(Date),
        userAgent: "vitest",
        ipAddress: "203.0.113.77"
      });
      // Thirty days, like a session made by signing in.
      expect(data.expiresAt.getTime() - before).toBeGreaterThanOrEqual(30 * 24 * 60 * 60 * 1000);
      expect(data.expiresAt.getTime() - before).toBeLessThan(30 * 24 * 60 * 60 * 1000 + 60_000);

      // The cookie holds the token whose hash was stored, signed the way the session check expects.
      expect(applySessionCookie).toHaveBeenCalledTimes(1);
      const [target, cookie] = vi.mocked(applySessionCookie).mock.calls[0];
      expect(target).toBe(res);
      expect(cookie.expiresAt).toBe(data.expiresAt);
      const token = verifySignedCookieValue(cookie.value);
      expect(token).not.toBeNull();
      expect(hashToken(token as string)).toBe(data.tokenHash);
    });

    it("writes the audit entry for the change", async () => {
      const req = change();
      await POST(req);

      expect(auditLog).toHaveBeenCalledTimes(1);
      expect(auditLog).toHaveBeenCalledWith({ userId: user.id, action: "auth.password_change", entity: "User", entityId: user.id, request: req });
    });

    it("hands out no session and sets no cookie when the transaction fails, and says the change failed", async () => {
      prisma.$transaction.mockRejectedValue(new Error("database down"));
      const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

      const res = await POST(change());

      expect(res.status).toBe(500);
      expect(applySessionCookie).not.toHaveBeenCalled();
      expect(auditLog).not.toHaveBeenCalled();
      error.mockRestore();
    });
  });

  describe("a failure after the change was committed", () => {
    it("still answers that the password changed and gives this device its session when the audit entry cannot be written", async () => {
      vi.mocked(auditLog).mockRejectedValue(new Error("audit database down"));
      const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

      const res = await POST(change());

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ data: { changed: true } });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(applySessionCookie).toHaveBeenCalledTimes(1);
      // The log line is a fixed text: nothing from the failed call (its data or its message) is repeated in it.
      expect(error).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(error.mock.calls)).not.toContain("audit database down");
      error.mockRestore();
    });
  });

  describe("no password material in the audit trail", () => {
    it("keeps both passwords and the stored hashes out of the success audit entry", async () => {
      await POST(change());

      const cookie = vi.mocked(applySessionCookie).mock.calls[0][1].value;
      const written = JSON.stringify(vi.mocked(auditLog).mock.calls.map(([entry]) => ({ ...entry, request: undefined })));
      for (const secret of [CURRENT, NEXT, "stored-hash", "new-hash", cookie]) expect(written).not.toContain(secret);
      expect(Object.keys(vi.mocked(auditLog).mock.calls[0][0])).not.toContain("metadata");
    });

    it("keeps them out of the failed-attempt audit entry too", async () => {
      await POST(change({ currentPassword: "not-my-password" }));

      const written = JSON.stringify(vi.mocked(auditLog).mock.calls.map(([entry]) => ({ ...entry, request: undefined })));
      for (const secret of [CURRENT, NEXT, "not-my-password", "stored-hash"]) expect(written).not.toContain(secret);
      expect(Object.keys(vi.mocked(auditLog).mock.calls[0][0])).not.toContain("metadata");
    });
  });

  describe("rate limits", () => {
    it("answers 429 on the sixth attempt from one address, and never reaches the password check", async () => {
      const address = "203.0.113.50";
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        expect((await POST(change({}, { address }))).status).toBe(200);
      }
      vi.mocked(verifyPassword).mockClear();

      const sixth = await POST(change({}, { address }));
      const body = await sixth.json();

      expect(sixth.status).toBe(429);
      expect(body.error.code).toBe("RATE_LIMITED");
      expect(verifyPassword).not.toHaveBeenCalled();
    });

    it("counts a signed-out request against the address as well", async () => {
      vi.mocked(requireUser).mockRejectedValue(unauthorized());
      const address = "203.0.113.51";
      for (let attempt = 1; attempt <= 5; attempt += 1) expect((await POST(change({}, { address }))).status).toBe(401);

      expect((await POST(change({}, { address }))).status).toBe(429);
    });

    it("locks the account after five wrong passwords, whichever address they come from", async () => {
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        expect((await POST(change({ currentPassword: `wrong-${attempt}` }))).status).toBe(403);
      }
      vi.mocked(verifyPassword).mockClear();

      // A sixth address, and even the right password: the account is locked for the rest of the window.
      const res = await POST(change({ currentPassword: CURRENT }));
      const body = await res.json();

      expect(res.status).toBe(429);
      expect(body.error.code).toBe("RATE_LIMITED");
      expect(verifyPassword).not.toHaveBeenCalled();
      expectNothingWritten();
    });

    it("holds the per-account bound for guesses that arrive at the same time: five are checked, the rest are refused unchecked", async () => {
      // A real password check takes time; the attempt has to be counted before it starts, not after it ends.
      vi.mocked(verifyPassword).mockImplementation(async (password) => {
        await tick();
        return password === CURRENT;
      });

      const responses = await Promise.all(Array.from({ length: 20 }, (_, index) => POST(change({ currentPassword: `wrong-${index}` }))));
      const statuses = responses.map((res) => res.status);

      expect(statuses.filter((status) => status === 403)).toHaveLength(5);
      expect(statuses.filter((status) => status === 429)).toHaveLength(15);
      expect(verifyPassword).toHaveBeenCalledTimes(5);
      expectNothingWritten();
    });

    it("does not let the right password through when it is only the last of many simultaneous guesses", async () => {
      vi.mocked(verifyPassword).mockImplementation(async (password) => {
        await tick();
        return password === CURRENT;
      });
      const guesses = [...Array.from({ length: 19 }, (_, index) => `wrong-${index}`), CURRENT];

      const responses = await Promise.all(guesses.map((currentPassword) => POST(change({ currentPassword }))));

      expect(responses.map((res) => res.status)).toEqual([...Array(5).fill(403), ...Array(15).fill(429)]);
      expectNothingWritten();
    });

    it("counts an attempt that ends in 'same password' as a right one: the failures before it are forgotten", async () => {
      for (let attempt = 1; attempt <= 4; attempt += 1) await POST(change({ currentPassword: `wrong-${attempt}` }));
      expect((await POST(change({ currentPassword: CURRENT, newPassword: CURRENT }))).status).toBe(422);

      for (let attempt = 1; attempt <= 5; attempt += 1) expect((await POST(change({ currentPassword: `again-${attempt}` }))).status).toBe(403);
      expect((await POST(change({ currentPassword: "one-more" }))).status).toBe(429);
    });

    it("puts every request without a forwarded address into one shared bucket", async () => {
      // No X-Forwarded-For and no X-Real-IP: the limiter keys on "local", so a proxy that loses the header limits everyone together.
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        vi.mocked(requireUser).mockResolvedValue({ id: `account-${attempt}`, email: `account${attempt}@example.com`, passwordHash: "stored-hash" } as never);
        expect((await POST(change({}, { address: null }))).status).toBe(200);
      }

      vi.mocked(requireUser).mockResolvedValue(user as never);
      const sixth = await POST(change({}, { address: null }));

      expect(sixth.status).toBe(429);
      expect((await sixth.json()).error.code).toBe("RATE_LIMITED");
    });

    it("does not lock another account", async () => {
      for (let attempt = 1; attempt <= 5; attempt += 1) await POST(change({ currentPassword: `wrong-${attempt}` }));

      const other = { id: "someone-else", email: "other@example.com", passwordHash: "other-hash" };
      vi.mocked(requireUser).mockResolvedValue(other as never);
      expect((await POST(change())).status).toBe(200);
    });

    it("forgets the wrong attempts once the right password was used", async () => {
      for (let attempt = 1; attempt <= 4; attempt += 1) await POST(change({ currentPassword: `wrong-${attempt}` }));
      expect((await POST(change())).status).toBe(200);

      for (let attempt = 1; attempt <= 4; attempt += 1) expect((await POST(change({ currentPassword: `again-${attempt}` }))).status).toBe(403);
    });

    it("lets the account try again when the window has passed", async () => {
      vi.useFakeTimers();
      try {
        for (let attempt = 1; attempt <= 5; attempt += 1) await POST(change({ currentPassword: `wrong-${attempt}` }));
        expect((await POST(change())).status).toBe(429);

        vi.advanceTimersByTime(15 * 60 * 1000 + 1000);

        expect((await POST(change())).status).toBe(200);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("an account with two-factor sign-in", () => {
    it("changes the password without asking for a code: the signed-in session and the current password are the proof", async () => {
      vi.mocked(requireUser).mockResolvedValue({ ...user, twoFactorEnabled: true } as never);

      const res = await POST(change());

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ data: { changed: true } });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      // The route takes no code at all: sending one is an unknown key.
      expect((await POST(change({ totpCode: "123456" }))).status).toBe(422);
    });
  });

  describe("the shared demo account", () => {
    it("is refused with 403 PASSWORD_CHANGE_DEMO_ACCOUNT while demo mode is on, before anything is checked or written", async () => {
      mocks.demo.on = true;
      vi.mocked(requireUser).mockResolvedValue({ ...user, email: "Demo@Nazm.example" } as never);

      const res = await POST(change());
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.error.code).toBe("PASSWORD_CHANGE_DEMO_ACCOUNT");
      expect(verifyPassword).not.toHaveBeenCalled();
      expectNothingWritten();
    });

    it("does not stop another account while demo mode is on", async () => {
      mocks.demo.on = true;

      expect((await POST(change())).status).toBe(200);
    });

    it("does not apply when demo mode is off", async () => {
      vi.mocked(requireUser).mockResolvedValue({ ...user, email: "demo@nazm.example" } as never);

      expect((await POST(change())).status).toBe(200);
    });
  });
});
