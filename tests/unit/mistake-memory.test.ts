import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { getMistakeMemory } from "@/lib/services/mistake-memory";

// Every journal entry belongs to a trade; the trade's open time dates the mistake.
const makeEntry = (mistakes: string[], daysAgo: number, rMultiple: number | null = null) => ({
  mistakes,
  trade: { rMultiple, openedAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000) }
});

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

describe("getMistakeMemory", () => {
  let prismaFindMany: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const { prisma } = await import("@/lib/db/prisma");
    prismaFindMany = vi.fn(async () => [
      makeEntry(["late entry", "oversizing"], 1, -1.5),
      makeEntry(["late entry", "FOMO"], 2, -0.8),
      makeEntry(["late entry"], 3, 0.5),
      makeEntry(["oversizing"], 5, -2.0),
      makeEntry(["FOMO"], 10, -1.0)
    ]);
    Object.assign(prisma, {
      tradeJournalEntry: { findMany: prismaFindMany }
    });
  });

  afterEach(() => vi.clearAllMocks());

  it("returns patterns sorted by frequency descending", async () => {
    const patterns = await getMistakeMemory("user-1");
    expect(patterns[0].mistake).toBe("late entry");
    expect(patterns[0].frequency).toBe(3);
  });

  it("computes streak as the count of recent sessions containing the mistake", async () => {
    const patterns = await getMistakeMemory("user-1");
    const lateEntry = patterns.find((p) => p.mistake === "late entry");
    // "late entry" appears in entries 0, 1, 2 (first 3 of 5 most recent)
    expect(lateEntry?.streak).toBe(3);
  });

  it("computes avgRImpact as the mean R multiple for trades with that mistake", async () => {
    const patterns = await getMistakeMemory("user-1");
    const lateEntry = patterns.find((p) => p.mistake === "late entry");
    // R values: -1.5, -0.8, 0.5 → mean = (-1.5 + -0.8 + 0.5) / 3 ≈ -0.6
    expect(lateEntry?.avgRImpact).toBeCloseTo(-0.6, 1);
  });

  it("sets avgRImpact to null when no trades have R multiples", async () => {
    prismaFindMany.mockResolvedValueOnce([makeEntry(["fomo"], 1, null)]);
    const patterns = await getMistakeMemory("user-1");
    expect(patterns[0].avgRImpact).toBeNull();
  });

  it("returns at most 10 patterns", async () => {
    const manyEntries = Array.from({ length: 15 }, (_, i) => makeEntry([`mistake_${i}`], i + 1));
    prismaFindMany.mockResolvedValueOnce(manyEntries);
    const patterns = await getMistakeMemory("user-1");
    expect(patterns.length).toBeLessThanOrEqual(10);
  });

  it("dates mistakes by when the trade was opened, not when its journal row was created", async () => {
    // An import creates journal rows for old trades today; their mistakes are not this week's.
    await getMistakeMemory("user-1", 14);
    expect(prismaFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "user-1", trade: { openedAt: { gte: expect.any(Date) } } }),
        orderBy: { trade: { openedAt: "desc" } }
      })
    );
  });

  it("reports when a mistake was last seen from the trade's open time", async () => {
    const patterns = await getMistakeMemory("user-1");
    const lateEntry = patterns.find((p) => p.mistake === "late entry")!;

    expect(Date.now() - lateEntry.lastSeen.getTime()).toBeCloseTo(24 * 60 * 60 * 1000, -4);
  });
});
