import { describe, expect, it } from "vitest";
import { describeViolation } from "@/features/trade-plans/limit-warnings";
import type { PlanRiskViolation } from "@/lib/calculations/plan-risk-check";

const risk = (overrides: Partial<PlanRiskViolation> = {}): PlanRiskViolation => ({ code: "risk_per_trade", limit: 0.5, actual: 1, source: "strategy", ...overrides });

describe("a limit violation, in words, with both numbers and where the limit comes from", () => {
  it("Persian, strategy limit: the sentence the audit asked for", () => {
    expect(describeViolation(risk(), "Range fade", "fa")).toBe("ریسک این پلن ۱٪ است؛ سقف استراتژی «Range fade» ۰٫۵٪ است.");
  });

  it("English, strategy limit", () => {
    expect(describeViolation(risk(), "Range fade", "en")).toBe(`This plan's risk is 1%; the limit of strategy "Range fade" is 0.5%.`);
  });

  it("names the account settings when the limit comes from there", () => {
    expect(describeViolation(risk({ source: "account", limit: 1, actual: 2 }), null, "en")).toBe("This plan's risk is 2%; the risk per trade limit in your settings is 1%.");
    expect(describeViolation(risk({ source: "account", limit: 1, actual: 2 }), null, "fa")).toBe("ریسک این پلن ۲٪ است؛ سقف ریسک هر معامله در تنظیمات شما ۱٪ است.");
  });

  it("says daily loss for the daily limit, from the strategy or from the settings", () => {
    const daily = risk({ code: "daily_loss", limit: 2, actual: 3 });
    expect(describeViolation(daily, "Range fade", "en")).toBe(`This plan's risk is 3%; the daily loss limit of strategy "Range fade" is 2%.`);
    expect(describeViolation({ ...daily, source: "account" }, null, "en")).toBe("This plan's risk is 3%; the daily loss limit in your settings is 2%.");
    expect(describeViolation(daily, "Range fade", "fa")).toBe("ریسک این پلن ۳٪ است؛ سقف ضرر روزانه در استراتژی «Range fade» ۲٪ است.");
    expect(describeViolation({ ...daily, source: "account" }, null, "fa")).toBe("ریسک این پلن ۳٪ است؛ سقف ضرر روزانه در تنظیمات شما ۲٪ است.");
  });

  it("counts plans for the open positions limit", () => {
    const open = risk({ code: "open_positions", limit: 2, actual: 3 });
    expect(describeViolation(open, "Range fade", "en")).toBe(`With this plan you would have 3 planned or active plans; the open positions limit of strategy "Range fade" is 2.`);
    expect(describeViolation(open, "Range fade", "fa")).toBe("با این پلن، ۳ پلن برنامه‌ریزی‌شده یا فعال خواهید داشت؛ سقف پوزیشن‌های باز در استراتژی «Range fade» ۲ است.");
    expect(describeViolation({ ...open, source: "account" }, null, "en")).toBe("With this plan you would have 3 planned or active plans; the open positions limit in your settings is 2.");
    expect(describeViolation({ ...open, source: "account" }, null, "fa")).toBe("با این پلن، ۳ پلن برنامه‌ریزی‌شده یا فعال خواهید داشت؛ سقف پوزیشن‌های باز در تنظیمات شما ۲ است.");
  });

  it("says «پوزیشن» for a position in Persian, as the risk desk, the import and the performance screens do", () => {
    for (const code of ["risk_per_trade", "daily_loss", "open_positions"] as const) {
      for (const source of ["strategy", "account"] as const) {
        expect(describeViolation(risk({ code, source }), "S", "fa"), `${code} ${source}`).not.toContain("موقعیت");
      }
    }
  });

  it("writes fractions with the decimal mark of the language and no trailing zeros", () => {
    expect(describeViolation(risk({ limit: 0.25, actual: 1.5 }), "S", "fa")).toContain("۱٫۵٪");
    expect(describeViolation(risk({ limit: 0.25, actual: 1.5 }), "S", "fa")).toContain("۰٫۲۵٪");
    expect(describeViolation(risk({ limit: 0.25, actual: 1.5 }), "S", "en")).toContain("1.5%");
  });

  it("never tells the trader what to do with a position", () => {
    for (const code of ["risk_per_trade", "daily_loss", "open_positions"] as const) {
      for (const source of ["strategy", "account"] as const) {
        for (const locale of ["en", "fa"] as const) {
          const text = describeViolation(risk({ code, source }), "S", locale);
          expect(text, `${code} ${source} ${locale}`).not.toMatch(/\b(?:should|must|reduce|close|lower|cut)\b|کاهش دهید|ببندید|باید/i);
        }
      }
    }
  });
});
