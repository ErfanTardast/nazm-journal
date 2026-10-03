import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

/** A small in-memory stand-in for the tables this route reads and writes, so the tests see what a caller would see. */
const store = vi.hoisted(() => ({
  user: null as Row | null,
  trade: [] as Row[],
  strategy: [] as Row[],
  tradePlan: [] as Row[]
}));

vi.mock("@/lib/db/prisma", () => {
  const matches = (row: Row, where: Row) => Object.entries(where).every(([key, value]) => row[key] === value);
  const table = (rows: () => Row[]) => ({
    findFirst: vi.fn(async ({ where }: { where: Row }) => rows().find((row) => matches(row, where)) ?? null)
  });
  return {
    prisma: {
      user: {
        findUnique: vi.fn(async ({ where }: { where: Row }) => (store.user && matches(store.user, where) ? { ...store.user } : null)),
        update: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
          if (!store.user || !matches(store.user, where)) throw new Error("no such user");
          Object.assign(store.user, data);
          return { ...store.user };
        }),
        updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
          if (!store.user || !matches(store.user, where)) return { count: 0 };
          Object.assign(store.user, data);
          return { count: 1 };
        })
      },
      trade: table(() => store.trade),
      strategy: table(() => store.strategy),
      tradePlan: table(() => store.tradePlan)
    }
  };
});
vi.mock("@/lib/auth/session", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/security/audit", () => ({ auditLog: vi.fn().mockResolvedValue(undefined) }));

import { unauthorized } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/session";
import { auditLog } from "@/lib/security/audit";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { GET, POST } from "@/app/api/onboarding/state/route";

const USER = "user-1";

function post(body: unknown, init: { contentType?: string } = {}) {
  return POST(
    new Request("http://localhost/api/onboarding/state", {
      method: "POST",
      headers: { "content-type": init.contentType ?? "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body)
    })
  );
}

const get = () => GET(new Request("http://localhost/api/onboarding/state"));
const stateOf = async (response: Response) => (await response.json()).data.state;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  store.user = { id: USER, tradingPlatform: null, primaryGoal: null, onboardedAt: null };
  store.trade = [];
  store.strategy = [];
  store.tradePlan = [];
  vi.mocked(requireUser).mockResolvedValue({ id: USER } as never);
});

describe("GET /api/onboarding/state", () => {
  it("is 401 for someone who is signed out", async () => {
    vi.mocked(requireUser).mockRejectedValue(unauthorized());
    expect((await get()).status).toBe(401);
    expect((await post({ done: true })).status).toBe(401);
  });

  it("gives a new account an empty state", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(await stateOf(response)).toEqual({
      tradingPlatform: null,
      primaryGoal: null,
      onboardedAt: null,
      hasTrades: false,
      hasStrategy: false,
      hasPlan: false,
      hasSample: false
    });
  });

  it("says when sample data is loaded, without counting it as the person's own", async () => {
    store.user = { id: USER, tradingPlatform: null, primaryGoal: null, onboardedAt: null, sampleLoadedAt: new Date("2026-10-02T09:00:00.000Z") };
    store.trade.push({ userId: USER, isSample: true });
    expect(await stateOf(await get())).toMatchObject({ hasSample: true, hasTrades: false });
  });

  it("counts the person's own trades, strategies and plans", async () => {
    store.trade.push({ userId: USER, isSample: false });
    store.strategy.push({ userId: USER, isSample: false });
    store.tradePlan.push({ userId: USER, isSample: false });
    expect(await stateOf(await get())).toMatchObject({ hasTrades: true, hasStrategy: true, hasPlan: true });
  });

  it("does not count sample rows as the person's own", async () => {
    store.trade.push({ userId: USER, isSample: true });
    store.strategy.push({ userId: USER, isSample: true });
    store.tradePlan.push({ userId: USER, isSample: true });
    expect(await stateOf(await get())).toMatchObject({ hasTrades: false, hasStrategy: false, hasPlan: false });
  });

  it("does not count another person's rows", async () => {
    store.trade.push({ userId: "someone-else", isSample: false });
    store.strategy.push({ userId: "someone-else", isSample: false });
    store.tradePlan.push({ userId: "someone-else", isSample: false });
    expect(await stateOf(await get())).toMatchObject({ hasTrades: false, hasStrategy: false, hasPlan: false });
  });

  it("reads a stored answer that is not one of the choices as not answered", async () => {
    store.user = { id: USER, tradingPlatform: "ctrader", primaryGoal: "", onboardedAt: null };
    expect(await stateOf(await get())).toMatchObject({ tradingPlatform: null, primaryGoal: null });
  });

  it("is limited per address", async () => {
    await get();
    expect(enforceRateLimit).toHaveBeenCalledWith(expect.any(Request), "onboarding:state:read", expect.any(Number), expect.any(Number));
  });
});

describe("POST /api/onboarding/state", () => {
  it("stores the trading platform and hands back the state", async () => {
    const response = await post({ tradingPlatform: "mt5" });
    expect(response.status).toBe(200);
    expect(await stateOf(response)).toMatchObject({ tradingPlatform: "mt5", primaryGoal: null, onboardedAt: null });
    expect(await stateOf(await get())).toMatchObject({ tradingPlatform: "mt5" });
  });

  it.each(["mt5", "other", "manual"])("stores the trading platform %s", async (tradingPlatform) => {
    await post({ tradingPlatform });
    expect(store.user?.tradingPlatform).toBe(tradingPlatform);
  });

  it.each(["discipline", "risk", "performance", "strategy"])("stores the goal %s", async (primaryGoal) => {
    await post({ primaryGoal });
    expect(store.user?.primaryGoal).toBe(primaryGoal);
  });

  it("changes only what was sent", async () => {
    await post({ tradingPlatform: "mt5" });
    await post({ primaryGoal: "risk" });
    expect(await stateOf(await get())).toMatchObject({ tradingPlatform: "mt5", primaryGoal: "risk" });
    await post({ tradingPlatform: "manual" });
    expect(await stateOf(await get())).toMatchObject({ tradingPlatform: "manual", primaryGoal: "risk" });
  });

  it("marks the flow done, with the time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-02T09:30:00.000Z"));
    const state = await stateOf(await post({ done: true }));
    expect(state.onboardedAt).toBe("2026-10-02T09:30:00.000Z");
  });

  it("keeps the first date when it is marked done again", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-02T09:30:00.000Z"));
    await post({ done: true });
    vi.setSystemTime(new Date("2026-10-05T18:00:00.000Z"));
    const state = await stateOf(await post({ done: true, primaryGoal: "performance" }));
    expect(state.onboardedAt).toBe("2026-10-02T09:30:00.000Z");
    expect(state.primaryGoal).toBe("performance");
  });

  it("never takes the flow back to not done", async () => {
    await post({ done: true });
    expect((await post({ done: false })).status).toBe(422);
    expect((await post({ onboardedAt: null })).status).toBe(422);
    expect(store.user?.onboardedAt).toBeInstanceOf(Date);
  });

  it("still lets the person answer after the flow was done, without moving the date", async () => {
    await post({ done: true });
    const first = store.user?.onboardedAt;
    await post({ tradingPlatform: "other" });
    expect(store.user?.onboardedAt).toBe(first);
    expect(store.user?.tradingPlatform).toBe("other");
  });

  it("refuses an unknown key", async () => {
    const response = await post({ tradingPlatform: "mt5", isAdmin: true });
    expect(response.status).toBe(422);
    expect(store.user?.tradingPlatform).toBeNull();
  });

  it("refuses an unknown value and changes nothing", async () => {
    expect((await post({ tradingPlatform: "ctrader" })).status).toBe(422);
    expect((await post({ primaryGoal: "get-rich" })).status).toBe(422);
    expect((await post({ tradingPlatform: "mt5", primaryGoal: "get-rich" })).status).toBe(422);
    expect(store.user).toMatchObject({ tradingPlatform: null, primaryGoal: null, onboardedAt: null });
  });

  it("refuses a body that is not an object, or a value of the wrong type", async () => {
    expect((await post([])).status).toBe(422);
    expect((await post({ done: "yes" })).status).toBe(422);
    expect((await post({ tradingPlatform: 1 })).status).toBe(422);
    expect((await post({ tradingPlatform: null })).status).toBe(422);
  });

  it("refuses an empty or garbled body: it saves nothing, so it is not a save and leaves no audit entry", async () => {
    for (const body of ["", "   ", "{}", "not json at all", '{"tradingPlatform": "mt5"']) {
      expect((await post(body)).status, JSON.stringify(body)).toBe(422);
    }
    expect(store.user).toMatchObject({ tradingPlatform: null, primaryGoal: null, onboardedAt: null });
    expect(auditLog).not.toHaveBeenCalled();
  });

  it("writes one audit entry for a save that changed something", async () => {
    await post({ primaryGoal: "risk" });
    expect(auditLog).toHaveBeenCalledTimes(1);
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "onboarding.state.save", userId: USER, metadata: { primaryGoal: "risk" } }));
  });

  it("refuses a body sent as another content type", async () => {
    expect((await post({ done: true }, { contentType: "text/plain" })).status).toBe(415);
    expect(store.user?.onboardedAt).toBeNull();
  });

  it("refuses a body that is far too large", async () => {
    const response = await post(JSON.stringify({ tradingPlatform: "mt5", note: "x".repeat(10_000) }));
    expect(response.status).toBe(413);
    expect(store.user?.tradingPlatform).toBeNull();
  });

  it("counts the person's own rows in the state it answers with, and not the sample ones", async () => {
    store.trade.push({ userId: USER, isSample: true });
    store.strategy.push({ userId: USER, isSample: false });
    expect(await stateOf(await post({ primaryGoal: "discipline" }))).toMatchObject({ hasTrades: false, hasStrategy: true, hasPlan: false });
  });

  it("is limited per address", async () => {
    await post({ done: true });
    expect(enforceRateLimit).toHaveBeenCalledWith(expect.any(Request), "onboarding:state:save", expect.any(Number), expect.any(Number));
  });
});
