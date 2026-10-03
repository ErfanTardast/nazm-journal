import { describe, expect, it } from "vitest";
import { DATA_CATEGORIES, buildDeletionPreview, exportableCategories } from "@/lib/privacy/data-inventory";
import { buildReleaseReadiness } from "@/lib/release/readiness";

describe("privacy data inventory (pure, read-only)", () => {
  it("lists exportable categories and never marks deletion reversible", () => {
    expect(DATA_CATEGORIES.length).toBeGreaterThan(0);
    expect(exportableCategories().every((c) => c.exportable)).toBe(true);
    expect(exportableCategories().length).toBeLessThan(DATA_CATEGORIES.length); // AI audit is not exported
    expect(buildDeletionPreview().reversible).toBe(false);
  });

  it("sums supplied counts for a deletion preview without negative/fractional leaks", () => {
    const preview = buildDeletionPreview({ trades: 12, journalEntries: 8, watchlists: -3, strategies: 2.9 });
    expect(preview.totalRecords).toBe(12 + 8 + 0 + 2); // negatives clamp to 0, fractions truncate
    expect(preview.categories.find((c) => c.key === "trades")?.count).toBe(12);
    expect(preview.categories.filter((c) => c.key !== "payments").every((c) => c.willDelete)).toBe(true);
    expect(preview.categories.find((c) => c.key === "payments")?.willDelete).toBe(false);
  });
});

describe("release readiness gate (pure)", () => {
  const allReady = {
    privacyPolicy: true,
    accountDeletion: true,
    dataExport: true,
    aiRefusalGuard: true,
    pwaManifest: true,
    twaDocs: true,
    storeMetadata: true
  };

  it("is READY only when every blocking safety gate is satisfied", () => {
    expect(buildReleaseReadiness(allReady).state).toBe("READY");
    const missingSafety = buildReleaseReadiness({ ...allReady, aiRefusalGuard: false });
    expect(missingSafety.state).toBe("NOT_READY");
    expect(missingSafety.blockingGaps).toContain("AI refusal guard");
  });

  it("treats store-release items as advisory (READY with advisory gaps listed)", () => {
    const r = buildReleaseReadiness({ ...allReady, pwaManifest: false, storeMetadata: false });
    expect(r.state).toBe("READY"); // advisory gaps don't block
    expect(r.advisoryGaps).toEqual(expect.arrayContaining(["PWA manifest + assets", "Store metadata"]));
  });

  it("defaults everything to not-ready from an empty input", () => {
    const r = buildReleaseReadiness();
    expect(r.state).toBe("NOT_READY");
    expect(r.blockingGaps.length).toBeGreaterThan(0);
  });
});

describe("payment records in the data inventory", () => {
  it("exports payments but keeps them (without identity) on account deletion", async () => {
    const { DATA_CATEGORIES: categories } = await import("@/lib/privacy/data-inventory");
    expect(categories.find((c) => c.key === "payments")).toMatchObject({ exportable: true, deletedOnAccountDeletion: false });
  });

  it("counts the user's payments in the deletion preview", async () => {
    const { countAccountDeletionRecords } = await import("@/lib/services/account-deletion");
    const count = () => ({ count: async () => 0 });
    const db = new Proxy({}, { get: (_t, key) => (key === "payment" ? { count: async () => 2 } : count()) });
    const counts = await countAccountDeletionRecords("u1", db as never);
    expect(counts.payments).toBe(2);
  });
});
