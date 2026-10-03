import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema, userSettingsSchema } from "@/lib/validation/auth";
import { csvImportSchema, ideaCreateSchema, reviewCreateSchema, reviewGenerateSchema, reviewUpdateSchema, tradeCreateSchema, tradeUpdateSchema } from "@/lib/validation/trading";

describe("validation schemas", () => {
  it("normalizes auth emails", () => {
    const result = loginSchema.parse({ email: "DEMO@NAZM.EXAMPLE", password: "x" });
    expect(result.email).toBe("demo@nazm.example");
  });

  it("rejects weak registration passwords", () => {
    expect(() => registerSchema.parse({ email: "a@b.com", name: "AB", password: "weak" })).toThrow();
  });

  it("accepts an optional sign-up language of fa or en only", () => {
    const account = { email: "a@b.com", name: "AB", password: "LongEnough123" };
    expect(registerSchema.parse({ ...account, locale: "fa" }).locale).toBe("fa");
    expect(registerSchema.parse(account).locale).toBeUndefined();
    expect(() => registerSchema.parse({ ...account, locale: "de" })).toThrow();
  });

  it("normalizes trade symbols", () => {
    const result = tradeCreateSchema.parse({
      symbol: "btcusdt",
      market: "crypto",
      side: "long",
      entryPrice: 100,
      quantity: 1,
      openedAt: "2026-06-10T00:00:00.000Z"
    });
    expect(result.symbol).toBe("BTCUSDT");
  });

  it("validates review generation inputs", () => {
    const result = reviewGenerateSchema.parse({ type: "weekly", createReminder: true });
    expect(result.type).toBe("weekly");
    expect(result.createReminder).toBe(true);
  });

  it("rejects inverted review periods", () => {
    expect(() =>
      reviewCreateSchema.parse({
        type: "daily",
        title: "Daily review",
        periodStart: "2026-06-15T00:00:00.000Z",
        periodEnd: "2026-06-14T00:00:00.000Z"
      })
    ).toThrow();
  });

  it("validates review update checklist shape", () => {
    const result = reviewUpdateSchema.parse({
      id: "review_12345",
      status: "completed",
      checklist: [{ key: "risk", label: "Review risk defaults", completed: true }],
      completedAt: "2026-06-14T10:00:00.000Z",
      carryForward: true
    });
    expect(result.checklist?.[0]?.completed).toBe(true);
    expect(result.carryForward).toBe(true);
  });

  it("validates idea capture inputs and normalizes symbols", () => {
    const result = ideaCreateSchema.parse({
      title: "BTC review hypothesis",
      market: "crypto",
      symbols: ["btcusdt"],
      type: "market_observation",
      thesis: "Review whether liquidity reclaim conditions match the playbook.",
      confidence: 6
    });
    expect(result.symbols).toEqual(["BTCUSDT"]);
    expect(result.status).toBe("draft");
  });
});

describe("tradeUpdateSchema", () => {
  it("does not fill create-time defaults into a partial edit", () => {
    // A default here would reopen a closed trade and zero its fees on any edit.
    const parsed = tradeUpdateSchema.parse({ id: "trade-1", setupType: "breakout" });

    expect(parsed).toEqual({ id: "trade-1", setupType: "breakout" });
  });

  it("does not let an edit change which imported position a trade is", () => {
    expect(tradeUpdateSchema.safeParse({ id: "trade-1", externalId: "mt5:1:2" }).success).toBe(false);
  });

  it("still applies the defaults when a trade is created", () => {
    const parsed = tradeCreateSchema.parse({ symbol: "eurusd", market: "forex", side: "long", entryPrice: 1.1, quantity: 0.1, openedAt: "2026-09-01" });

    expect(parsed).toMatchObject({ status: "open", fees: 0, ruleFollowed: "unknown" });
  });
});

describe("userSettingsSchema starting balance", () => {
  it("reads the balance from the settings form's text", () => {
    expect(userSettingsSchema.parse({ startingBalance: "10000" }).startingBalance).toBe(10_000);
  });

  it("treats an empty field as no balance", () => {
    expect(userSettingsSchema.parse({ startingBalance: "" }).startingBalance).toBeNull();
  });

  it("rejects a balance that is not a positive amount", () => {
    expect(userSettingsSchema.safeParse({ startingBalance: "-5" }).success).toBe(false);
    expect(userSettingsSchema.safeParse({ startingBalance: "abc" }).success).toBe(false);
  });
});

describe("time zone settings and imports", () => {
  it("accepts the New York close convention and real zones as the broker time zone", () => {
    expect(userSettingsSchema.parse({ brokerTimeZone: "mt5:new-york-close" }).brokerTimeZone).toBe("mt5:new-york-close");
    expect(userSettingsSchema.parse({ brokerTimeZone: "Etc/GMT-3" }).brokerTimeZone).toBe("Etc/GMT-3");
    expect(userSettingsSchema.safeParse({ brokerTimeZone: "Mars/Base" }).success).toBe(false);
  });

  it("accepts a time zone for reading an import's zone-less times", () => {
    expect(csvImportSchema.parse({ csv: "a", timeZone: "mt5:new-york-close" }).timeZone).toBe("mt5:new-york-close");
    expect(csvImportSchema.safeParse({ csv: "a", timeZone: "Mars/Base" }).success).toBe(false);
  });
});
