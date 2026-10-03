import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { buildExportBundle } from "@/lib/services/export";

const makeMockPrisma = (userId: string) => ({
  user: {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
      where.id === userId ? { id: userId, email: "test@example.com", name: "Test" } : null
    )
  },
  onboardingProfile: { findUnique: vi.fn(async () => null) },
  riskProfile: { findUnique: vi.fn(async () => null) },
  trade: { findMany: vi.fn(async () => []) },
  review: { findMany: vi.fn(async () => []) },
  idea: { findMany: vi.fn(async () => []) },
  strategy: { findMany: vi.fn(async () => []) },
  tradePlan: { findMany: vi.fn(async () => []) },
  tradeImport: { findMany: vi.fn(async () => []) },
  alert: { findMany: vi.fn(async () => []) },
  watchlist: { findMany: vi.fn(async () => []) },
  portfolio: { findMany: vi.fn(async () => []) },
  tradingSession: { findMany: vi.fn(async () => []) },
  backtest: { findMany: vi.fn(async () => []) },
  uploadedFile: { findMany: vi.fn(async () => []) },
  payment: { findMany: vi.fn(async () => []) }
});

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

describe("buildExportBundle", () => {
  const USER_A = "user-a-id";
  const USER_B = "user-b-id";

  beforeEach(async () => {
    const { prisma } = await import("@/lib/db/prisma");
    const mock = makeMockPrisma(USER_A);
    Object.assign(prisma, mock);
  });

  afterEach(() => vi.clearAllMocks());

  it("returns exportedAt, schemaVersion, and user profile", async () => {
    const bundle = await buildExportBundle(USER_A);
    expect(bundle.exportedAt).toBeDefined();
    expect(bundle.schemaVersion).toBe("1");
    expect(bundle.user?.id).toBe(USER_A);
  });

  it("scopes all queries to the requesting userId", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    await buildExportBundle(USER_A);

    expect(prisma.onboardingProfile.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: USER_A } }));
    expect(prisma.riskProfile.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: USER_A } }));
    for (const model of [
      "idea",
      "tradeImport",
      "alert",
      "watchlist",
      "portfolio",
      "tradingSession",
      "backtest",
      "uploadedFile",
      "payment"
    ] as const) {
      const mock = (prisma as unknown as Record<string, { findMany: ReturnType<typeof vi.fn> }>)[model].findMany;
      expect(mock).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: USER_A } }));
    }
  });

  it("leaves sample rows out of the export: only the person's own trades, strategies, plans and reviews are asked for", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    await buildExportBundle(USER_A);

    for (const model of ["trade", "strategy", "tradePlan", "review"] as const) {
      const mock = (prisma as unknown as Record<string, { findMany: ReturnType<typeof vi.fn> }>)[model].findMany;
      expect(mock, model).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: USER_A, isSample: false } }));
    }
  });

  it("includes the first-run answers on the user", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    await buildExportBundle(USER_A);

    const select = (prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0].select as Record<string, boolean>;
    expect(select).toMatchObject({ tradingPlatform: true, primaryGoal: true, onboardedAt: true });
    // The marker that sample data is loaded is an internal flag, not the person's data.
    expect(select).not.toHaveProperty("sampleLoadedAt");
  });

  it("exports the user's own payment records without internal reviewer ids", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    const row = { id: "pay-1", tier: "pro", amount: 5.004213, currency: "usdt", trackingCode: "ab".repeat(32), status: "approved" };
    const findMany = (prisma as unknown as { payment: { findMany: ReturnType<typeof vi.fn> } }).payment.findMany;
    findMany.mockResolvedValueOnce([row]);
    const bundle = await buildExportBundle(USER_A);
    expect(bundle.payments).toEqual([row]);
    const select = (findMany.mock.calls[0][0] as { select: Record<string, boolean> }).select;
    expect(select).toMatchObject({ trackingCode: true, amount: true, status: true, refundedAt: true });
    expect(select).not.toHaveProperty("reviewedById");
    expect(select).not.toHaveProperty("refundedById");
  });

  it("does not return data for a different user", async () => {
    const bundle = await buildExportBundle(USER_B);
    expect(bundle.user).toBeNull();
  });
});

// A stand-in that applies the filters it is given, so the answer shows what a person would find in the file.
describe("buildExportBundle with sample data in the account", () => {
  const USER = "user-a-id";
  const rowsOf = {
    trade: [
      { id: "own-trade", userId: USER, isSample: false, symbol: "EURUSD", journalEntry: { id: "own-entry" } },
      { id: "sample-trade", userId: USER, isSample: true, symbol: "XAUUSD", journalEntry: { id: "sample-entry" } },
      { id: "other-trade", userId: "someone-else", isSample: false, symbol: "GBPUSD", journalEntry: null }
    ],
    strategy: [
      { id: "own-strategy", userId: USER, isSample: false },
      { id: "sample-strategy", userId: USER, isSample: true }
    ],
    tradePlan: [
      { id: "own-plan", userId: USER, isSample: false },
      { id: "sample-plan", userId: USER, isSample: true }
    ],
    review: [
      { id: "own-review", userId: USER, isSample: false },
      { id: "sample-review", userId: USER, isSample: true }
    ]
  };

  type Where = { userId: string; isSample?: boolean };
  const apply =
    (rows: Array<Record<string, unknown>>) =>
    async ({ where }: { where: Where }) =>
      rows.filter((row) => row.userId === where.userId && (where.isSample === undefined || row.isSample === where.isSample));

  beforeEach(async () => {
    const { prisma } = await import("@/lib/db/prisma");
    Object.assign(prisma, makeMockPrisma(USER), {
      user: {
        findUnique: vi.fn(async () => ({
          id: USER,
          email: "test@example.com",
          tradingPlatform: "mt5",
          primaryGoal: "discipline",
          onboardedAt: new Date("2026-10-02T09:00:00Z")
        }))
      },
      trade: { findMany: vi.fn(apply(rowsOf.trade)) },
      strategy: { findMany: vi.fn(apply(rowsOf.strategy)) },
      tradePlan: { findMany: vi.fn(apply(rowsOf.tradePlan)) },
      review: { findMany: vi.fn(apply(rowsOf.review)) }
    });
  });

  it("holds the person's own rows and none of the sample's", async () => {
    const bundle = await buildExportBundle(USER);

    expect(bundle.trades.map((row: { id: string }) => row.id)).toEqual(["own-trade"]);
    expect(bundle.strategies.map((row: { id: string }) => row.id)).toEqual(["own-strategy"]);
    expect(bundle.plans.map((row: { id: string }) => row.id)).toEqual(["own-plan"]);
    expect(bundle.reviews.map((row: { id: string }) => row.id)).toEqual(["own-review"]);
    // No sample journal entry travels with a trade either.
    expect(JSON.stringify(bundle)).not.toContain("sample-");
  });

  it("carries the first-run answers on the user", async () => {
    const bundle = await buildExportBundle(USER);

    expect(bundle.user).toMatchObject({ tradingPlatform: "mt5", primaryGoal: "discipline", onboardedAt: new Date("2026-10-02T09:00:00Z") });
  });
});
