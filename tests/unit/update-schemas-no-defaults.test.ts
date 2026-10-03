import { describe, expect, it } from "vitest";
import {
  alertCreateSchema,
  alertUpdateSchema,
  ideaCreateSchema,
  ideaUpdateSchema,
  portfolioCreateSchema,
  portfolioUpdateSchema,
  strategyCreateSchema,
  strategyUpdateSchema
} from "@/lib/validation/trading";

const ID = "ckv1a2b3c4d5e6f7g8h9i0j1k";

// Zod 4 keeps `.default()` inside `.partial()`. An update schema built from a create schema therefore fills every
// defaulted field that the request left out, and the service writes it: renaming a portfolio set its cash to 0.
describe("update schemas apply no create-time defaults", () => {
  it("renaming a portfolio leaves its currency and cash balance alone", () => {
    expect(portfolioUpdateSchema.parse({ id: ID, name: "Swing account" })).toEqual({ id: ID, name: "Swing account" });
  });

  it("renaming a strategy leaves its rule lists, status and active flag alone", () => {
    expect(strategyUpdateSchema.parse({ id: ID, name: "London breakout" })).toEqual({ id: ID, name: "London breakout" });
  });

  it("editing an alert's message leaves its status and channels alone", () => {
    expect(alertUpdateSchema.parse({ id: ID, message: "Check the daily loss limit" })).toEqual({ id: ID, message: "Check the daily loss limit" });
  });

  it("retitling an idea leaves its symbols, status, confidence and tags alone", () => {
    expect(ideaUpdateSchema.parse({ id: ID, title: "Range fade after news" })).toEqual({ id: ID, title: "Range fade after news" });
  });

  it("still validates the fields that are sent", () => {
    expect(portfolioUpdateSchema.safeParse({ id: ID, cashBalance: -5 }).success).toBe(false);
    expect(strategyUpdateSchema.safeParse({ id: ID, entryRules: [] }).success).toBe(false);
    expect(alertUpdateSchema.safeParse({ id: ID, status: "exploded" }).success).toBe(false);
    expect(ideaUpdateSchema.safeParse({ id: ID, confidence: 11 }).success).toBe(false);
    expect(ideaUpdateSchema.parse({ id: ID, symbols: ["eurusd"] }).symbols).toEqual(["EURUSD"]);
  });

  it("refuses unknown keys, like the create schemas", () => {
    for (const schema of [portfolioUpdateSchema, strategyUpdateSchema, alertUpdateSchema, ideaUpdateSchema]) {
      expect(schema.safeParse({ id: ID, surprise: true }).success).toBe(false);
    }
  });
});

describe("create schemas keep their defaults", () => {
  it("fills a new portfolio's currency and cash", () => {
    expect(portfolioCreateSchema.parse({ name: "Main" })).toEqual({ name: "Main", baseCurrency: "USD", cashBalance: 0 });
  });

  it("fills a new strategy's lists, status and active flag", () => {
    const parsed = strategyCreateSchema.parse({ name: "Breakout", entryRules: ["Close above range"], exitRules: ["Target hit"], allowedMarkets: ["forex"] });
    expect(parsed).toMatchObject({ invalidationRules: [], riskRules: [], timeframes: [], allowedSessions: [], checklist: [], commonMistakes: [], idealMarketConditions: [], tags: [], status: "active", isActive: true });
  });

  it("fills a new alert's status and channels", () => {
    const parsed = alertCreateSchema.parse({ type: "price", condition: { above: 1.1 }, message: "Price reached the level" });
    expect(parsed).toMatchObject({ status: "active", channels: ["in_app"] });
  });

  it("fills a new idea's symbols, status, confidence and tags", () => {
    const parsed = ideaCreateSchema.parse({ title: "Range fade", market: "forex", type: "setup_idea", thesis: "Fade the range extremes." });
    expect(parsed).toMatchObject({ symbols: [], status: "draft", confidence: 5, tags: [] });
  });
});
