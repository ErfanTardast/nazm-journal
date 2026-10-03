import { describe, expect, it } from "vitest";
import { tradePlanCreateSchema, tradePlanUpdateSchema } from "@/lib/validation/trading";

const ID = "plan-12345";

/** Every field a plan can carry, each set to a valid non-default value. */
const FULL = {
  strategyId: "strategy-12345",
  market: "forex",
  symbol: "eurusd",
  bias: "Range between the two sessions",
  entryZone: "1.0850-1.0870",
  stopLoss: 1.08,
  takeProfit: 1.1,
  riskAmount: 50,
  riskPercent: 0.5,
  checklist: { newsChecked: true, direction: "long" },
  invalidationRule: "A close under 1.0800 cancels the plan",
  relevantNews: "ECB speech at 14:00",
  notes: "Wait for the London open",
  status: "active",
  plannedFor: "2026-10-02T08:00:00.000Z",
  sizing: {
    symbol: "EURUSD",
    direction: "buy",
    balance: 10000,
    riskPercent: 0.5,
    entry: 1.086,
    stopLoss: 1.08,
    finalTp: 1.1,
    totalVolume: 0.08,
    riskMoney: 50,
    lossAtStop: 48,
    finalRr: 2.33,
    legs: [{ volume: 0.08, takeProfit: 1.1, rr: 2.33 }],
    sizedAt: "2026-10-02T07:30:00.000Z"
  }
} as const;

// Root cause of the plan-status reset: Zod 4 keeps `.default()` inside `.partial()`, so a PATCH that only sent
// `checklist` was parsed as `status: "planned"` and silently overwrote the stored status.
describe("tradePlanUpdateSchema", () => {
  it("does not invent a status (or any default) for a field the request did not send", () => {
    const parsed = tradePlanUpdateSchema.parse({ id: ID, checklist: { direction: "long" } });
    expect(parsed).toEqual({ id: ID, checklist: { direction: "long" } });
    expect("status" in parsed).toBe(false);
  });

  it("keeps a lone id as just the id", () => {
    const parsed = tradePlanUpdateSchema.parse({ id: ID });
    expect(Object.keys(parsed)).toEqual(["id"]);
  });

  it("does not fill the checklist when only the status is sent", () => {
    const parsed = tradePlanUpdateSchema.parse({ id: ID, status: "canceled" });
    expect(parsed).toEqual({ id: ID, status: "canceled" });
    expect("checklist" in parsed).toBe(false);
  });

  it("passes every sent field through, with the same cleaning as create", () => {
    const created = tradePlanCreateSchema.parse(FULL);
    const { ...updated } = tradePlanUpdateSchema.parse({ id: ID, ...FULL });
    expect(updated).toEqual({ id: ID, ...created });
    expect(updated.symbol).toBe("EURUSD");
    expect(updated.plannedFor).toBeInstanceOf(Date);
  });

  it("cleans typed numbers like create (Persian digits, decimal mark)", () => {
    const parsed = tradePlanUpdateSchema.parse({ id: ID, stopLoss: "۱٫۰۹۸", riskPercent: "۰٫۵" });
    expect(parsed).toEqual({ id: ID, stopLoss: 1.098, riskPercent: 0.5 });
  });

  it("still lets a field be cleared with an explicit null", () => {
    const parsed = tradePlanUpdateSchema.parse({ id: ID, notes: null, plannedFor: null, stopLoss: null });
    expect(parsed).toEqual({ id: ID, notes: null, plannedFor: null, stopLoss: null });
  });

  it("accepts each field on its own, which is how the screens send them", () => {
    for (const [key, value] of Object.entries(FULL)) {
      const parsed = tradePlanUpdateSchema.parse({ id: ID, [key]: value });
      expect(Object.keys(parsed).sort(), key).toEqual([key, "id"].sort());
    }
  });

  it("has exactly the create schema's fields plus the id and the expected status, so a new field cannot be left out", () => {
    // `expectedStatus` is the one extra: the status the sender last saw, not a field of the plan.
    expect(Object.keys(tradePlanUpdateSchema.shape).sort()).toEqual([...Object.keys(tradePlanCreateSchema.shape), "id", "expectedStatus"].sort());
  });

  describe("still rejects what create rejects", () => {
    const invalid: [string, Record<string, unknown>][] = [
      ["an unknown status", { status: "archived" }],
      ["an empty symbol", { symbol: "" }],
      ["a symbol over 24 characters", { symbol: "X".repeat(25) }],
      ["a one-character bias", { bias: "x" }],
      ["an empty entry zone", { entryZone: "" }],
      ["a market that does not exist", { market: "futures-x" }],
      ["a zero stop loss", { stopLoss: 0 }],
      ["a negative take profit", { takeProfit: -1 }],
      ["a negative risk amount", { riskAmount: -5 }],
      ["a risk percent over 100", { riskPercent: 101 }],
      ["a checklist that is not an object", { checklist: "done" }],
      ["notes over 4000 characters", { notes: "n".repeat(4001) }],
      ["a date that is not a date", { plannedFor: "tomorrow-ish" }],
      ["an unknown field", { leverage: 10 }]
    ];

    it.each(invalid)("%s", (_name, patch) => {
      expect(tradePlanUpdateSchema.safeParse({ id: ID, ...patch }).success).toBe(false);
      // Create refuses the same value (the unknown-status and similar cases fail there too).
      expect(tradePlanCreateSchema.safeParse({ ...FULL, ...patch }).success).toBe(false);
    });

    it("an update without an id", () => {
      expect(tradePlanUpdateSchema.safeParse({ notes: "x" }).success).toBe(false);
      expect(tradePlanUpdateSchema.safeParse({ id: "abc", notes: "x" }).success).toBe(false);
    });
  });
});

describe("tradePlanCreateSchema defaults", () => {
  const minimal = { market: "crypto", symbol: "btcusdt", bias: "Above 65k", entryZone: "64600-65100" };

  it("still fills a status and an empty checklist for a new plan", () => {
    const parsed = tradePlanCreateSchema.parse(minimal);
    expect(parsed.status).toBe("planned");
    expect(parsed.checklist).toEqual({});
    expect(parsed.symbol).toBe("BTCUSDT");
  });

  it("keeps a status and a checklist the request sent", () => {
    const parsed = tradePlanCreateSchema.parse({ ...minimal, status: "active", checklist: { riskCalculated: true } });
    expect(parsed.status).toBe("active");
    expect(parsed.checklist).toEqual({ riskCalculated: true });
  });

  it("leaves the optional fields out of a minimal plan", () => {
    const parsed = tradePlanCreateSchema.parse(minimal);
    for (const key of ["strategyId", "stopLoss", "takeProfit", "riskAmount", "riskPercent", "notes", "plannedFor"]) {
      expect(parsed, key).not.toHaveProperty(key);
    }
  });
});
