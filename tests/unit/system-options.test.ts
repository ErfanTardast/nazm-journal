import { describe, expect, it } from "vitest";
import { getSystemOptions } from "@/lib/services/system-options";
import { userSettingsSchema } from "@/lib/validation/auth";

describe("system options", () => {
  it("exposes only the MVP market scope", () => {
    const options = getSystemOptions();
    expect(options.product.supportedMarkets.map((market) => market.value)).toEqual(["forex", "crypto", "stocks"]);
  });

  it("keeps system language review-oriented", () => {
    const text = JSON.stringify(getSystemOptions()).toLowerCase();
    expect(text).toContain("daily review");
    expect(text).toContain("risk check");
    expect(text).not.toContain("trading signal");
    expect(text).not.toContain("copy trading");
    expect(text).not.toContain("auto trading");
  });

  it("validates user risk defaults", () => {
    const parsed = userSettingsSchema.parse({
      locale: "fa",
      theme: "dark",
      timezone: "Asia/Tehran",
      riskPerTradePct: "0.5",
      maxDailyLossPct: "2",
      maxWeeklyLossPct: "5"
    });

    expect(parsed.riskPerTradePct).toBe(0.5);
    expect(() => userSettingsSchema.parse({ riskPerTradePct: 100 })).toThrow();
  });
});
