import { describe, expect, it, vi } from "vitest";
import { calculatePlaybookAdherence } from "@/lib/calculations/playbook-adherence";

describe("calculatePlaybookAdherence (pure)", () => {
  const strategies = [
    { id: "s1", name: "Breakout", commonMistakes: ["chasing", "no stop"] },
    { id: "s2", name: "Pullback", commonMistakes: [] }
  ];
  const trades = [
    { strategyId: "s1", ruleFollowed: "followed" as const, rMultiple: 2 },
    { strategyId: "s1", ruleFollowed: "followed" as const, rMultiple: -1 },
    { strategyId: "s1", ruleFollowed: "broken" as const, rMultiple: -1 },
    { strategyId: "s1", ruleFollowed: "mixed" as const, rMultiple: null },
    { strategyId: "s1", ruleFollowed: "unknown" as const, rMultiple: 1 }, // excluded from assessed
    { strategyId: null, ruleFollowed: "followed" as const, rMultiple: 5 } // unplanned -> ignored
  ];

  it("computes adherence, counts, avg R, and top mistake", () => {
    const [breakout, pullback] = calculatePlaybookAdherence(strategies, trades);
    expect(breakout.strategyId).toBe("s1"); // sorted by tradeCount desc
    expect(breakout.tradeCount).toBe(5);
    expect(breakout.assessedCount).toBe(4); // followed(2)+broken(1)+mixed(1); "unknown" excluded
    expect(breakout.followedCount).toBe(2);
    expect(breakout.brokenCount).toBe(1);
    expect(breakout.mixedCount).toBe(1);
    expect(breakout.adherenceRate).toBeCloseTo(2 / 4, 5);
    expect(breakout.avgRMultiple).toBeCloseTo((2 - 1 - 1 + 1) / 4, 5); // 4 finite R values among s1 trades (null excluded)
    expect(breakout.topMistake).toBe("chasing");

    expect(pullback.tradeCount).toBe(0);
    expect(pullback.adherenceRate).toBeNull();
    expect(pullback.topMistake).toBeNull();
  });

  it("returns one row per strategy, sorted by trade count", () => {
    const rows = calculatePlaybookAdherence(strategies, trades);
    expect(rows.map((r) => r.strategyId)).toEqual(["s1", "s2"]);
  });
});

describe("getPlaybookAdherence (service, mocked prisma)", () => {
  it("hydrates from prisma and applies the pure calc", async () => {
    vi.resetModules();
    vi.doMock("@/lib/db/prisma", () => ({
      prisma: {
        strategy: { findMany: vi.fn().mockResolvedValue([{ id: "s1", name: "Breakout", commonMistakes: ["chasing"] }]) },
        trade: {
          findMany: vi.fn().mockResolvedValue([
            { strategyId: "s1", ruleFollowed: "followed", rMultiple: 2 },
            { strategyId: "s1", ruleFollowed: "broken", rMultiple: -1 }
          ])
        }
      }
    }));
    const { getPlaybookAdherence } = await import("@/lib/services/playbook-adherence");
    const rows = await getPlaybookAdherence("u1");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ strategyId: "s1", tradeCount: 2, followedCount: 1, brokenCount: 1 });
    expect(rows[0].adherenceRate).toBeCloseTo(0.5, 5);
    vi.doUnmock("@/lib/db/prisma");
  });
});
