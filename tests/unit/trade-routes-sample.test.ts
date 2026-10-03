import { beforeEach, describe, expect, it, vi } from "vitest";
import { unauthorized } from "@/lib/api/errors";
import { fakeDb, type FakeDb } from "./support/fake-db";

const holder = vi.hoisted(() => ({ prisma: {} as Record<string, unknown> }));
const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), auditLog: vi.fn(), enforceRateLimit: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: holder.prisma }));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/security/audit", () => ({ auditLog: mocks.auditLog }));
vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimit: mocks.enforceRateLimit }));

import { POST as importTrades } from "@/app/api/trades/import/route";
import { POST as createTradeRoute } from "@/app/api/trades/route";
import { loadSampleWorkspace } from "@/lib/services/sample-workspace";

/** What the person's own first trade says back: whether the sample workspace went before it was written. */
const A = "user-a";
const trade = {
  symbol: "EURUSD",
  market: "forex",
  side: "long",
  status: "closed",
  entryPrice: 1.1,
  stopLoss: 1.098,
  exitPrice: 1.104,
  quantity: 0.5,
  openedAt: "2026-10-01T08:00:00Z"
};
const header = "symbol,market,side,status,entryPrice,exitPrice,quantity,openedAt,externalId";
const csv = [header, "EURUSD,forex,long,closed,1.1000,1.1040,0.5,2026-09-28T08:00:00Z,mt5:7001:1"].join("\n");
const mapping = Object.fromEntries(header.split(",").map((field) => [field, field]));

let db: FakeDb;

function post(url: string, body: unknown) {
  return new Request(`http://localhost${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
  db = fakeDb({ user: [{ id: A, sampleLoadedAt: null }] });
  Object.assign(holder.prisma, db.client);
  mocks.requireUser.mockResolvedValue({ id: A, locale: "en" });
});

describe("POST /api/trades", () => {
  it("says sampleRemoved: true when the sample workspace went before the trade was written", async () => {
    await loadSampleWorkspace(A, "en", new Date("2026-10-02T09:30:00.000Z"));

    const response = await createTradeRoute(post("/api/trades", trade));

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.sampleRemoved).toBe(true);
    expect(body.data.trade).toMatchObject({ symbol: "EURUSD" });
    expect(db.rows("trade")).toHaveLength(1);
    expect(db.rows("trade").some((row) => row.isSample === true)).toBe(false);
  });

  it("says sampleRemoved: false for an account without sample data", async () => {
    const response = await createTradeRoute(post("/api/trades", trade));

    expect(response.status).toBe(201);
    expect((await response.json()).data.sampleRemoved).toBe(false);
  });

  it("answers 404 for a strategy that is not the person's, and keeps the sample", async () => {
    await loadSampleWorkspace(A, "en", new Date("2026-10-02T09:30:00.000Z"));
    db.rows("strategy").push({ id: "strategy-of-b", userId: "user-b", isSample: false });

    const response = await createTradeRoute(post("/api/trades", { ...trade, strategyId: "strategy-of-b" }));

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("NOT_FOUND");
    expect(db.rows("trade")).toHaveLength(30);
  });

  it("signed out is 401 and touches nothing", async () => {
    mocks.requireUser.mockRejectedValue(unauthorized());
    const response = await createTradeRoute(post("/api/trades", trade));
    expect(response.status).toBe(401);
    expect(db.writes()).toEqual([]);
  });
});

describe("POST /api/trades/import", () => {
  it("says sampleRemoved: true when the import removed the sample workspace", async () => {
    await loadSampleWorkspace(A, "en", new Date("2026-10-02T09:30:00.000Z"));

    const response = await importTrades(post("/api/trades/import", { csv, mapping, previewOnly: false }));

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data).toMatchObject({ imported: 1, sampleRemoved: true });
    expect(db.rows("trade")).toHaveLength(1);
    expect(db.rows("trade")[0].isSample).toBe(false);
  });

  it("says sampleRemoved: false for a preview, which writes nothing", async () => {
    await loadSampleWorkspace(A, "en", new Date("2026-10-02T09:30:00.000Z"));

    const response = await importTrades(post("/api/trades/import", { csv, mapping, previewOnly: true }));

    expect((await response.json()).data).toMatchObject({ imported: 0, sampleRemoved: false });
    expect(db.rows("trade")).toHaveLength(30);
  });
});
