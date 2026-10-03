import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Sign-in and a password change both start a session. They build it in one place, so the lifetime and what a session
// row records cannot drift apart between the two.
describe("newSessionRecord", () => {
  beforeEach(() => {
    vi.stubEnv("SESSION_SECRET", "unit-test-session-secret-at-least-32-chars");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("pairs a row with the cookie for the same secret token, for thirty days", async () => {
    const { newSessionRecord, SESSION_DAYS } = await import("@/lib/auth/session-record");
    const { hashToken, verifySignedCookieValue } = await import("@/lib/security/tokens");
    const request = new Request("http://localhost/api/auth/login", { headers: { "user-agent": "UnitTest/1.0", "x-forwarded-for": "203.0.113.9" } });

    const record = newSessionRecord("user-1", request);

    expect(SESSION_DAYS).toBe(30);
    expect(record.data.userId).toBe("user-1");
    expect(record.data.userAgent).toBe("UnitTest/1.0");
    expect(record.data.expiresAt.toISOString()).toBe("2026-10-31T12:00:00.000Z");
    expect(record.cookie.expiresAt).toEqual(record.data.expiresAt);
    // The cookie carries the token; the row stores only its hash.
    const token = verifySignedCookieValue(record.cookie.value);
    expect(token).toBeTruthy();
    expect(record.data.tokenHash).toBe(hashToken(token as string));
    expect(record.cookie.value).not.toContain(record.data.tokenHash);
  });

  it("makes a different token every time, and works without a request", async () => {
    const { newSessionRecord } = await import("@/lib/auth/session-record");
    const first = newSessionRecord("user-1");
    const second = newSessionRecord("user-1");
    expect(first.data.tokenHash).not.toBe(second.data.tokenHash);
    expect(first.data.userAgent).toBeUndefined();
    expect(first.data.ipAddress).toBeUndefined();
  });
});
