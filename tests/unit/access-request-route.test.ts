// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// The real rate limiter runs (in-memory buckets); the spy only records how it was called.
vi.mock("@/lib/security/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security/rate-limit")>();
  return { enforceRateLimit: vi.fn(actual.enforceRateLimit) };
});
vi.mock("@/lib/security/audit", () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    accessRequest: {
      upsert: vi.fn(async () => ({ id: "ar1" })),
      count: vi.fn(async () => 0),
      findUnique: vi.fn(async () => null),
      deleteMany: vi.fn(async () => ({ count: 0 }))
    },
    auditLog: { count: vi.fn(async () => 0) }
  }
}));

import { prisma } from "@/lib/db/prisma";
import { auditLog } from "@/lib/security/audit";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { POST } from "@/app/api/access-requests/route";

let nextIp = 1;
const freshIp = () => `203.0.113.${nextIp++}`;

function send(body: unknown, init: { ip?: string; contentType?: string | null; raw?: string } = {}) {
  const headers: Record<string, string> = { "x-forwarded-for": init.ip ?? freshIp() };
  if (init.contentType !== null) headers["content-type"] = init.contentType ?? "application/json";
  return POST(
    new Request("http://localhost/api/access-requests", {
      method: "POST",
      headers,
      body: init.raw ?? JSON.stringify(body)
    })
  );
}

const valid = { name: "Sara Trader", email: "Sara@Example.com", tradingPlatform: "mt5", note: "I keep a journal in Excel", locale: "fa" };
const GENERIC = { data: { received: true } };

const upsertArgs = () => vi.mocked(prisma.accessRequest.upsert).mock.calls[0][0] as {
  where: { email: string };
  create: Record<string, unknown>;
  update: Record<string, unknown>;
};

beforeEach(() => {
  vi.mocked(prisma.accessRequest.count).mockReset();
  vi.mocked(prisma.accessRequest.count).mockResolvedValue(0);
  vi.mocked(prisma.accessRequest.upsert).mockClear();
  vi.mocked(prisma.accessRequest.findUnique).mockReset();
  vi.mocked(prisma.accessRequest.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.auditLog.count).mockReset();
  vi.mocked(prisma.auditLog.count).mockResolvedValue(0);
  vi.mocked(auditLog).mockClear();
  vi.mocked(enforceRateLimit).mockClear();
});

describe("POST /api/access-requests", () => {
  it("records the request under the lower-cased e-mail and answers with a generic success", async () => {
    const res = await send(valid);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(GENERIC);
    expect(prisma.accessRequest.upsert).toHaveBeenCalledTimes(1);
    const { where, create } = upsertArgs();
    expect(where).toEqual({ email: "sara@example.com" });
    expect(create).toEqual({
      email: "sara@example.com",
      name: "Sara Trader",
      tradingPlatform: "mt5",
      note: "I keep a journal in Excel",
      locale: "fa"
    });
  });

  it("stores missing optional fields as null", async () => {
    await send({ name: "Sara Trader", email: "sara@example.com", locale: "en", note: "   " });

    const { create } = upsertArgs();
    expect(create).toMatchObject({ tradingPlatform: null, note: null, locale: "en" });
  });

  it("lets the first submission win: a repeat request for the same e-mail changes nothing the person typed", async () => {
    await send({ ...valid, name: "Someone Else", tradingPlatform: "manual", note: "send my code to other@example.com", locale: "en" });

    const { update, create } = upsertArgs();
    // The update branch is empty, so name, platform, note, language and status of the stored request stay as they were.
    expect(update).toEqual({});
    expect(create).toMatchObject({ name: "Someone Else", email: "sara@example.com" });
    expect(create).not.toHaveProperty("status");
  });

  it("answers a repeat request exactly like a first one, so it cannot reveal who already asked", async () => {
    const first = await send(valid);
    const firstBody = await first.text();
    vi.mocked(prisma.accessRequest.upsert).mockResolvedValueOnce({ id: "ar-existing" } as never);
    const repeat = await send(valid);

    expect(repeat.status).toBe(first.status);
    expect(await repeat.text()).toBe(firstBody);
  });

  describe("two first requests for one e-mail at the same moment", () => {
    // The upsert is a SELECT followed by an INSERT, so both can see no row and the second INSERT then hits the unique
    // index (Prisma code P2002). The request was stored by the other one, so the person must get the usual success.
    it("answers the usual success when the upsert loses the race (P2002), and finds the stored request", async () => {
      vi.mocked(prisma.accessRequest.upsert).mockRejectedValueOnce(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));
      vi.mocked(prisma.accessRequest.findUnique).mockResolvedValueOnce({ id: "ar1" } as never);

      const res = await send(valid);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(GENERIC);
      expect(prisma.accessRequest.findUnique).toHaveBeenCalledWith({ where: { email: "sara@example.com" } });
      expect(auditLog).toHaveBeenCalledTimes(1);
      expect(vi.mocked(auditLog).mock.calls[0][0]).toMatchObject({ action: "access.request", entity: "AccessRequest", entityId: "ar1" });
    });

    it("answers the same bytes as a request that won the race, so a script cannot tell the two apart", async () => {
      const first = await send(valid);
      const firstBody = await first.text();
      vi.mocked(prisma.accessRequest.upsert).mockRejectedValueOnce(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));
      vi.mocked(prisma.accessRequest.findUnique).mockResolvedValueOnce({ id: "ar1" } as never);

      const loser = await send(valid);

      expect(loser.status).toBe(first.status);
      expect(await loser.text()).toBe(firstBody);
    });

    it("still answers 500 when the unique constraint fails but no stored row can be found", async () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
      vi.mocked(prisma.accessRequest.upsert).mockRejectedValueOnce(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));

      const res = await send(valid);

      expect(res.status).toBe(500);
      expect(auditLog).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it("does not look for a stored row after any other database error", async () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
      vi.mocked(prisma.accessRequest.upsert).mockRejectedValueOnce(Object.assign(new Error("deadlock"), { code: "P2034" }));

      const res = await send(valid);

      expect(res.status).toBe(500);
      expect(prisma.accessRequest.findUnique).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  it("answers success but keeps nothing when the honeypot is filled", async () => {
    const res = await send({ ...valid, website: "https://spam.example" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(GENERIC);
    expect(prisma.accessRequest.upsert).not.toHaveBeenCalled();
    expect(prisma.accessRequest.count).not.toHaveBeenCalled();
  });

  describe("a honeypot hit leaves a data-free trace", () => {
    it("writes exactly one audit entry, action access.request_dropped, with no request object and no values", async () => {
      await send({ ...valid, website: "https://spam.example/buy?x=1" });

      expect(auditLog).toHaveBeenCalledTimes(1);
      const entry = vi.mocked(auditLog).mock.calls[0][0];
      // Only these two keys: no user, no entity id, no metadata, and no `request` (the helper would copy the IP and agent).
      expect(entry).toStrictEqual({ action: "access.request_dropped", entity: "AccessRequest" });
      const logged = JSON.stringify(entry).toLowerCase();
      expect(logged).not.toContain("spam.example");
      expect(logged).not.toContain("sara");
    });

    it("answers exactly like a first request even when the audit write fails", async () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
      vi.mocked(auditLog).mockRejectedValueOnce(new Error("db down"));

      const res = await send({ ...valid, website: "x" });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(GENERIC);
      spy.mockRestore();
    });

    it("writes no dropped entry for a real request", async () => {
      await send(valid);

      expect(vi.mocked(auditLog).mock.calls.map(([entry]) => entry.action)).toEqual(["access.request"]);
      expect(prisma.auditLog.count).not.toHaveBeenCalled();
    });

    describe("the trace is capped at 300 a day, so a script on many addresses cannot fill the log", () => {
      it("counts the dropped entries of the last 24 hours", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-11-01T12:00:00.000Z"));
        try {
          await send({ ...valid, website: "x" });
        } finally {
          vi.useRealTimers();
        }

        expect(prisma.auditLog.count).toHaveBeenCalledWith({
          where: { action: "access.request_dropped", createdAt: { gte: new Date("2026-10-31T12:00:00.000Z") } }
        });
      });

      it("still writes the entry while 299 are on record (the 300th)", async () => {
        vi.mocked(prisma.auditLog.count).mockResolvedValue(299);

        await send({ ...valid, website: "x" });

        expect(auditLog).toHaveBeenCalledTimes(1);
      });

      it("writes no entry for the 301st, and answers exactly like a success", async () => {
        vi.mocked(prisma.auditLog.count).mockResolvedValue(300);

        const res = await send({ ...valid, website: "x" });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual(GENERIC);
        expect(auditLog).not.toHaveBeenCalled();
        expect(prisma.accessRequest.upsert).not.toHaveBeenCalled();
      });

      it("answers the same bytes whether or not the entry was written", async () => {
        const written = await (await send({ ...valid, website: "x" })).text();
        vi.mocked(prisma.auditLog.count).mockResolvedValue(5000);

        const dropped = await (await send({ ...valid, website: "x" })).text();

        expect(dropped).toBe(written);
      });

      it("answers success and writes nothing when the count itself fails", async () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
        vi.mocked(prisma.auditLog.count).mockRejectedValueOnce(new Error("db down"));

        const res = await send({ ...valid, website: "x" });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual(GENERIC);
        expect(auditLog).not.toHaveBeenCalled();
        spy.mockRestore();
      });
    });
  });

  it("answers a honeypot-filled body like a success even when its other fields are junk", async () => {
    const res = await send({ website: "x", email: "not-an-email" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(GENERIC);
    expect(prisma.accessRequest.upsert).not.toHaveBeenCalled();
  });

  it("accepts an empty honeypot, which is what a person's browser sends", async () => {
    const res = await send({ ...valid, website: "" });

    expect(res.status).toBe(200);
    expect(prisma.accessRequest.upsert).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a missing name", { email: "a@example.com", locale: "fa" }],
    ["a bad e-mail", { name: "Sara", email: "nope", locale: "fa" }],
    ["an unknown platform", { name: "Sara", email: "a@example.com", locale: "fa", tradingPlatform: "ctrader" }],
    ["a note over 500 characters", { name: "Sara", email: "a@example.com", locale: "fa", note: "x".repeat(501) }],
    ["an unknown field", { name: "Sara", email: "a@example.com", locale: "fa", status: "invited" }],
    ["no locale", { name: "Sara", email: "a@example.com" }]
  ])("refuses %s with a 422 and stores nothing", async (_label, body) => {
    const res = await send(body);

    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
    expect(prisma.accessRequest.upsert).not.toHaveBeenCalled();
  });

  it("answers a NUL byte or a direction override in the name or note with a 422, not a 500, and stores nothing", async () => {
    // PostgreSQL text columns refuse NUL: before this check that request failed in the upsert as a 500.
    const NUL = String.fromCodePoint(0);
    const RLO = String.fromCodePoint(0x202e);
    for (const body of [
      { ...valid, name: `Sara${NUL}` },
      { ...valid, note: `hello${NUL}world` },
      { ...valid, name: `${RLO}Sara` },
      { ...valid, note: `${RLO}hello` }
    ]) {
      const res = await send(body);
      expect(res.status).toBe(422);
      expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
    }
    expect(prisma.accessRequest.upsert).not.toHaveBeenCalled();
  });

  it("names the failing field in the validation error so the page can say which one", async () => {
    const res = await send({ name: "Sara", email: "nope", locale: "fa" });

    expect((await res.json()).error.details.fieldErrors).toHaveProperty("email");
  });

  it("answers 415 to a body that is not JSON (a cross-site form post)", async () => {
    const res = await send(null, { contentType: "text/plain", raw: JSON.stringify(valid) });

    expect(res.status).toBe(415);
    expect(prisma.accessRequest.upsert).not.toHaveBeenCalled();
  });

  describe("body size", () => {
    it("refuses a body over 8 KB with 413 and the usual error shape, and stores nothing", async () => {
      const res = await send({ ...valid, note: "x".repeat(9 * 1024) });

      expect(res.status).toBe(413);
      expect(await res.json()).toEqual({ error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large", details: {} } });
      expect(prisma.accessRequest.upsert).not.toHaveBeenCalled();
      expect(prisma.accessRequest.count).not.toHaveBeenCalled();
    });

    it("refuses on the content-length header alone, without needing the body", async () => {
      const res = await POST(
        new Request("http://localhost/api/access-requests", {
          method: "POST",
          headers: { "x-forwarded-for": freshIp(), "content-type": "application/json", "content-length": String(8 * 1024 + 1) },
          body: JSON.stringify(valid)
        })
      );

      expect(res.status).toBe(413);
      expect(prisma.accessRequest.upsert).not.toHaveBeenCalled();
    });

    it("still takes the largest honest request (80-character name, 500-character Persian note)", async () => {
      const res = await send({ name: "ن".repeat(80), email: "sara@example.com", note: "س".repeat(500), locale: "fa", tradingPlatform: "other" });

      expect(res.status).toBe(200);
      expect(prisma.accessRequest.upsert).toHaveBeenCalledTimes(1);
    });

    it("counts an oversized body against the per-address budget too", async () => {
      const ip = freshIp();
      for (let i = 0; i < 5; i += 1) await send({ note: "x".repeat(20 * 1024) }, { ip });

      expect((await send(valid, { ip })).status).toBe(429);
    });
  });

  it("is limited per client address: 5 requests an hour under the scope access:request", async () => {
    const ip = freshIp();
    for (let i = 0; i < 5; i += 1) expect((await send(valid, { ip })).status).toBe(200);

    const sixth = await send(valid, { ip });
    expect(sixth.status).toBe(429);
    expect((await sixth.json()).error.code).toBe("RATE_LIMITED");
    expect(prisma.accessRequest.upsert).toHaveBeenCalledTimes(5);
    expect(enforceRateLimit).toHaveBeenCalledWith(expect.any(Request), "access:request", 5, 3600);

    // Another address has its own budget.
    expect((await send(valid)).status).toBe(200);
  });

  it("counts a honeypot hit against the budget too", async () => {
    const ip = freshIp();
    for (let i = 0; i < 5; i += 1) await send({ website: "x" }, { ip });

    expect((await send({ website: "x" }, { ip })).status).toBe(429);
  });

  describe("global ceiling", () => {
    it("answers 429 through the normal rate-limit error once more than 300 requests were created in the last 24 hours", async () => {
      vi.mocked(prisma.accessRequest.count).mockResolvedValue(301);

      const res = await send(valid);

      expect(res.status).toBe(429);
      expect(await res.json()).toEqual({
        error: { code: "RATE_LIMITED", message: "Too many requests. Please try again later.", details: {} }
      });
      expect(prisma.accessRequest.upsert).not.toHaveBeenCalled();
      expect(auditLog).not.toHaveBeenCalled();
    });

    it("looks exactly like the per-address limit, so a script learns nothing about which one it hit", async () => {
      const ip = freshIp();
      for (let i = 0; i < 5; i += 1) await send(valid, { ip });
      const perAddress = await send(valid, { ip });
      vi.mocked(prisma.accessRequest.count).mockResolvedValue(500);

      const global = await send(valid);

      expect(global.status).toBe(perAddress.status);
      expect(await global.text()).toBe(await perAddress.text());
    });

    it("still accepts a request when exactly 300 were created in the last 24 hours", async () => {
      vi.mocked(prisma.accessRequest.count).mockResolvedValue(300);

      expect((await send(valid)).status).toBe(200);
      expect(prisma.accessRequest.upsert).toHaveBeenCalledTimes(1);
    });

    it("counts the requests created since 24 hours ago", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-11-01T12:00:00.000Z"));
      try {
        await send(valid);
      } finally {
        vi.useRealTimers();
      }

      expect(prisma.accessRequest.count).toHaveBeenCalledWith({ where: { createdAt: { gte: new Date("2026-10-31T12:00:00.000Z") } } });
    });

    it("is not asked about for an invalid body or a honeypot hit", async () => {
      await send({ website: "x" });
      await send({ name: "Sara", email: "nope", locale: "fa" });

      expect(prisma.accessRequest.count).not.toHaveBeenCalled();
    });
  });

  it("writes an audit entry that holds no note, no e-mail, no IP address and no user agent", async () => {
    await send(valid);

    expect(auditLog).toHaveBeenCalledTimes(1);
    const entry = vi.mocked(auditLog).mock.calls[0][0];
    expect(entry).toMatchObject({ action: "access.request", entity: "AccessRequest", entityId: "ar1" });
    // The audit helper copies the IP address and user agent from `request` when it is given one.
    expect(entry.request).toBeUndefined();
    expect(entry.userId ?? null).toBeNull();
    const logged = JSON.stringify(entry);
    expect(logged).not.toContain("I keep a journal in Excel");
    expect(logged.toLowerCase()).not.toContain("sara@example.com");
  });

  it("answers 500 with no detail when the database fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(prisma.accessRequest.upsert).mockRejectedValueOnce(new Error("connection refused: 10.0.0.5"));

    const res = await send(valid);

    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("10.0.0.5");
    spy.mockRestore();
  });
});
