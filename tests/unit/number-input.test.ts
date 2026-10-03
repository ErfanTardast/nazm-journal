import { describe, expect, it } from "vitest";
import { normalizeNumberInput, parseNumberInput, toAsciiDigits } from "@/lib/validation/number-input";
import { userSettingsSchema } from "@/lib/validation/auth";
import {
  backtestCreateSchema,
  ideaCreateSchema,
  liquidationSchema,
  portfolioTransactionSchema,
  positionSizeSchema,
  riskCalculatorSchema,
  sessionCreateSchema,
  tradeCreateSchema,
  tradePlanConvertSchema,
  tradePlanCreateSchema
} from "@/lib/validation/trading";

// Persian keyboards type Persian digits by default; those (and Arabic-Indic digits, the Persian decimal
// separator and thousands separators) used to fail with an opaque "Request validation failed".
describe("normalizeNumberInput", () => {
  it.each([
    ["65000", "65000"],
    ["۶۵۰۰۰", "65000"],
    ["٦٥٠٠٠", "65000"],
    ["۱۲٫۵", "12.5"],
    ["٠٫٥", "0.5"],
    ["٣", "3"],
    ["1,250.5", "1250.5"],
    ["1,250", "1250"],
    ["۲۵٬۰۰۰", "25000"],
    ["۱٬۲۵۰٫۵", "1250.5"],
    ["1,234,567.89", "1234567.89"],
    ["  ۷  ", "7"],
    ["−۲٫۵", "-2.5"]
  ])("turns %s into %s", (input, expected) => {
    expect(normalizeNumberInput(input)).toBe(expected);
  });

  it("leaves numbers, null, undefined and empty strings alone", () => {
    expect(normalizeNumberInput(12.5)).toBe(12.5);
    expect(normalizeNumberInput(null)).toBeNull();
    expect(normalizeNumberInput(undefined)).toBeUndefined();
    expect(normalizeNumberInput("")).toBe("");
  });

  it("does not guess when a comma is not a thousands separator", () => {
    // "0,5" is a decimal comma in some locales; reading it as 5 would silently corrupt the value.
    expect(normalizeNumberInput("0,5")).toBe("0,5");
    expect(Number.isNaN(parseNumberInput("0,5"))).toBe(true);
    expect(Number.isNaN(parseNumberInput("12,34"))).toBe(true);
  });

  it("parses to a number for client-side use", () => {
    expect(parseNumberInput("۱۲٫۵")).toBe(12.5);
    expect(parseNumberInput("1,250.5")).toBe(1250.5);
    expect(parseNumberInput("٣")).toBe(3);
    expect(Number.isNaN(parseNumberInput("abc"))).toBe(true);
  });
});

describe("numeric fields accept Persian and Arabic-Indic input", () => {
  const base = { symbol: "btcusdt", market: "crypto", side: "long", openedAt: "2026-06-10T00:00:00.000Z" };

  it("trade fields", () => {
    const trade = tradeCreateSchema.parse({
      ...base,
      entryPrice: "۶۵٬۰۰۰٫۵",
      quantity: "۰٫۱",
      fees: "1,250.5",
      stopLoss: "٦٤٠٠٠",
      realizedPnl: "−۱۲٫۵",
      confidenceScore: "٣"
    });
    expect(trade.entryPrice).toBe(65000.5);
    expect(trade.quantity).toBe(0.1);
    expect(trade.fees).toBe(1250.5);
    expect(trade.stopLoss).toBe(64000);
    expect(trade.realizedPnl).toBe(-12.5);
    expect(trade.confidenceScore).toBe(3);
  });

  it("still validates ranges after normalizing", () => {
    expect(() => tradeCreateSchema.parse({ ...base, entryPrice: "۰", quantity: "1", fees: "0" })).toThrow();
    expect(() => tradeCreateSchema.parse({ ...base, entryPrice: "abc", quantity: "1", fees: "0" })).toThrow();
    expect(() => tradeCreateSchema.parse({ ...base, entryPrice: "1", quantity: "1", fees: "0", confidenceScore: "۱۱" })).toThrow();
    expect(() => tradeCreateSchema.parse({ ...base, entryPrice: "1", quantity: "1", fees: "0", riskPercent: "۱۰۱" })).toThrow();
  });

  it("keeps optional and nullable fields optional", () => {
    const trade = tradeCreateSchema.parse({ ...base, entryPrice: 1, quantity: 1, fees: 0, exitPrice: null });
    expect(trade.exitPrice).toBeNull();
    expect(trade.stopLoss).toBeUndefined();
    expect(trade.riskPercent).toBeUndefined();
  });

  it("plan and convert fields", () => {
    const plan = tradePlanCreateSchema.parse({
      market: "forex",
      symbol: "eurusd",
      bias: "range",
      entryZone: "1.10",
      stopLoss: "۱٫۰۹۸",
      riskPercent: "۰٫۵"
    });
    expect(plan.stopLoss).toBe(1.098);
    expect(plan.riskPercent).toBe(0.5);

    const convert = tradePlanConvertSchema.parse({ entryPrice: "۱٫۱", quantity: "٢", fees: "۱٬۰۰۰" });
    expect(convert.entryPrice).toBe(1.1);
    expect(convert.quantity).toBe(2);
    expect(convert.fees).toBe(1000);
    expect(tradePlanConvertSchema.parse({ entryPrice: 1, quantity: 1 }).fees).toBe(0);
  });

  it("risk calculator fields", () => {
    const size = positionSizeSchema.parse({ accountBalance: "۲۵٬۰۰۰", riskPercent: "۱", entryPrice: "۶۵۰۰۰", stopLoss: "۶۴۰۰۰", feeBuffer: "۱۰" });
    expect(size).toEqual({ accountBalance: 25000, riskPercent: 1, entryPrice: 65000, stopLoss: 64000, feeBuffer: 10 });
    const liquidation = liquidationSchema.parse({ side: "long", entryPrice: "٦٥٠٠٠", leverage: "۱۰", maintenanceMarginPercent: "٠٫٥" });
    expect(liquidation.leverage).toBe(10);
    expect(liquidation.maintenanceMarginPercent).toBe(0.5);
    expect(() => liquidationSchema.parse({ side: "long", entryPrice: "1", leverage: "۵۰۱" })).toThrow();
    const combined = riskCalculatorSchema.parse({ rewardRisk: { entryPrice: "۱۰۰", stopLoss: "۹۵", takeProfit: "۱۱۰" } });
    expect(combined.rewardRisk?.takeProfit).toBe(110);
  });

  it("portfolio, backtest, idea and session fields", () => {
    const tx = portfolioTransactionSchema.parse({ symbol: "aapl", market: "stocks", side: "long", quantity: "۱۰", price: "1,250.5", fees: "۱٫۵", executedAt: "2026-06-10T10:00:00.000Z" });
    expect(tx.price).toBe(1250.5);
    const backtest = backtestCreateSchema.parse({ name: "Test run", market: "crypto", timeframe: "1h", startingBalance: "۱۰٬۰۰۰", trades: [{ entryPrice: "۱۰۰", exitPrice: "۱۱۰", quantity: "۱", side: "long" }] });
    expect(backtest.startingBalance).toBe(10000);
    const idea = ideaCreateSchema.parse({ title: "Idea title", market: "crypto", type: "setup_idea", thesis: "A thesis", confidence: "٧" });
    expect(idea.confidence).toBe(7);
    const session = sessionCreateSchema.parse({ market: "forex", sessionLabel: "London", maxDailyLoss: "۲٫۵" });
    expect(session.maxDailyLoss).toBe(2.5);
  });

  it("settings fields", () => {
    const settings = userSettingsSchema.parse({ riskPerTradePct: "۱٫۵", maxDailyLossPct: "٣", maxWeeklyLossPct: "6", startingBalance: "۲۵٬۰۰۰" });
    expect(settings).toEqual({ riskPerTradePct: 1.5, maxDailyLossPct: 3, maxWeeklyLossPct: 6, startingBalance: 25000 });
    expect(userSettingsSchema.parse({ startingBalance: "" }).startingBalance).toBeNull();
    expect(userSettingsSchema.parse({ startingBalance: "   " }).startingBalance).toBeNull();
    expect(() => userSettingsSchema.parse({ riskPerTradePct: "۳۰" })).toThrow();
  });

  it("text fields are not touched", () => {
    const plan = tradePlanCreateSchema.parse({ market: "crypto", symbol: "btc", bias: "۱۲۳٫۵ notes", entryZone: "۱٬۰۰۰", notes: "۱۲٫۵ ۲۵٬۰۰۰" });
    expect(plan.bias).toBe("۱۲۳٫۵ notes");
    expect(plan.entryZone).toBe("۱٬۰۰۰");
    expect(plan.notes).toBe("۱۲٫۵ ۲۵٬۰۰۰");
  });
});

describe('normalizeNumberInput review follow-ups', () => {
  it('drops the Arabic thousands separator only between proper digit groups', () => {
    expect(Number(normalizeNumberInput('۱٬۲۵۰٫۵'))).toBe(1250.5);
    expect(Number.isNaN(Number(normalizeNumberInput('۱٬۲')))).toBe(true);
  });

  it('ignores invisible direction marks copied from right-to-left text', () => {
    expect(Number(normalizeNumberInput('‏۱۲٫۵'))).toBe(12.5);
    expect(Number(normalizeNumberInput('‎3.25؜'))).toBe(3.25);
  });
});

describe('toAsciiDigits', () => {
  it('turns Persian and Arabic-Indic digits into ASCII and leaves everything else', () => {
    expect(toAsciiDigits('۱۲۳۴۵۶')).toBe('123456');
    expect(toAsciiDigits(' ١٢ ab ')).toBe(' 12 ab ');
  });
});
