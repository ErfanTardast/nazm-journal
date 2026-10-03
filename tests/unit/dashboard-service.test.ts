import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/trades", () => ({ getTradeMetrics: vi.fn(async () => ({ totalTrades: 0 })) }));
vi.mock("@/lib/services/portfolios", () => ({ listPortfolios: vi.fn(async () => []) }));
vi.mock("@/lib/services/reviews", () => ({ getReviewFocus: vi.fn(async () => ({ overdueCount: 0 })) }));
vi.mock("@/lib/services/sessions", () => ({ getActiveSession: vi.fn(async () => null) }));

// Every model answers with an empty result; the counts are recorded so the test can read their filters.
const calls: { model: string; method: string; args: { where?: Record<string, unknown> } }[] = [];
vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get: (_target, model: string) =>
        new Proxy(
          {},
          {
            get: (_inner, method: string) => async (args: { where?: Record<string, unknown> }) => {
              calls.push({ model, method, args });
              return method === "count" ? 0 : method === "findUnique" ? null : [];
            }
          }
        )
    }
  )
}));

import { getDashboardOverview } from "@/lib/services/dashboard";

describe("getDashboardOverview", () => {
  it("counts rule breaks of trades opened in the last 7 days, not journal rows edited then", async () => {
    // Reviewing an old imported trade today updates its journal row; that is not a recent rule break.
    await getDashboardOverview("u1");

    const violations = calls.find((c) => c.model === "tradeJournalEntry" && c.method === "count" && c.args.where?.ruleFollowed === "broken");
    expect(violations?.args.where).toEqual({ userId: "u1", ruleFollowed: "broken", trade: { openedAt: { gte: expect.any(Date) } } });
  });
});
