import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatGeneratedDate, formatGeneratedNumber, localizeDigits, resolveGeneratedLocale } from "@/lib/services/locale";
import { aiModeSchema, aiReviewTradeSchema, reviewCreateSchema, reviewGenerateSchema, reviewUpdateSchema } from "@/lib/validation/trading";

// Server-generated text (coach answers, reviews, onboarding plan, alerts, mentor report) follows the user's language.
describe("resolveGeneratedLocale", () => {
  it("uses the language the screen asked for", () => {
    expect(resolveGeneratedLocale("fa", "en")).toBe("fa");
    expect(resolveGeneratedLocale("en", "fa")).toBe("en");
  });

  it("falls back to the language saved in the user's settings", () => {
    expect(resolveGeneratedLocale(undefined, "en")).toBe("en");
    expect(resolveGeneratedLocale(null, "fa")).toBe("fa");
  });

  it("ignores anything that is not a supported language", () => {
    expect(resolveGeneratedLocale("de", "en")).toBe("en");
    expect(resolveGeneratedLocale(42, "fa")).toBe("fa");
  });

  it("answers in Persian when nothing usable was given", () => {
    expect(resolveGeneratedLocale(undefined, undefined)).toBe("fa");
    expect(resolveGeneratedLocale("", "xx")).toBe("fa");
  });
});

describe("formatGeneratedNumber", () => {
  it("leaves English numbers exactly as toFixed writes them", () => {
    expect(formatGeneratedNumber(12.4, 1, "en")).toBe("12.4");
    expect(formatGeneratedNumber(-257, 2, "en")).toBe("-257.00");
    expect(formatGeneratedNumber(60, 0, "en")).toBe("60");
  });

  it("writes Persian digits and the Persian decimal mark for fa", () => {
    expect(formatGeneratedNumber(12.4, 1, "fa")).toBe("۱۲٫۴");
    expect(formatGeneratedNumber(0, 2, "fa")).toBe("۰٫۰۰");
    expect(formatGeneratedNumber(60, 0, "fa")).toBe("۶۰");
  });

  it("keeps the minus sign on the left of a negative Persian number inside right-to-left text", () => {
    expect(formatGeneratedNumber(-4.28, 2, "fa")).toBe("\u200E-۴٫۲۸");
  });

  it("writes the left-to-right mark as an escape, never as a raw invisible character a formatter could strip", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/services/locale.ts"), "utf8");

    expect(source).not.toContain("\u200E");
    expect(source).toContain('"\\u200E"');
  });
});

describe("formatGeneratedDate", () => {
  it("leaves the English date exactly as the ISO day it was", () => {
    expect(formatGeneratedDate("2026-06-08", "en")).toBe("2026-06-08");
  });

  it("writes a Persian date the way the reviews screen shows dates: Persian calendar, Persian digits, no ASCII digits or hyphens", () => {
    expect(formatGeneratedDate("2026-06-08", "fa")).toBe("۱۸ خرداد ۱۴۰۵");
    expect(formatGeneratedDate("2026-06-14", "fa")).toBe("۲۴ خرداد ۱۴۰۵");
    expect(formatGeneratedDate("2026-06-08", "fa")).not.toMatch(/[0-9-]/);
  });

  it("falls back to Persian digits for text that is not a calendar day", () => {
    expect(formatGeneratedDate("2026-13-45", "fa")).toBe("۲۰۲۶-۱۳-۴۵");
    expect(formatGeneratedDate("soon", "fa")).toBe("soon");
  });
});

describe("localizeDigits", () => {
  it("rewrites the digits and decimal marks of a number written elsewhere, for fa only", () => {
    expect(localizeDigits("0.5", "fa")).toBe("۰٫۵");
    expect(localizeDigits("1", "fa")).toBe("۱");
    expect(localizeDigits("0.5", "en")).toBe("0.5");
  });

  it("does not turn the full stop that ends a sentence into a decimal mark", () => {
    expect(localizeDigits("2 مرور. 3.5", "fa")).toBe("۲ مرور. ۳٫۵");
  });
});

describe("request schemas take an optional locale", () => {
  it("accepts fa and en and rejects other values", () => {
    expect(aiModeSchema.parse({ mode: "learning", locale: "fa" }).locale).toBe("fa");
    expect(aiModeSchema.parse({}).locale).toBeUndefined();
    expect(() => aiModeSchema.parse({ locale: "de" })).toThrow();
    expect(
      aiReviewTradeSchema.parse({ symbol: "EURUSD", side: "long", entryPrice: 1.1, locale: "en" }).locale
    ).toBe("en");
    expect(reviewGenerateSchema.parse({ type: "daily", locale: "fa" }).locale).toBe("fa");
    expect(() => reviewGenerateSchema.parse({ type: "daily", locale: "klingon" })).toThrow();
  });

  it("lets a manually created review and a review update carry it too", () => {
    const base = { type: "daily", title: "Review", periodStart: "2026-06-01", periodEnd: "2026-06-02" };
    expect(reviewCreateSchema.parse({ ...base, locale: "fa" }).locale).toBe("fa");
    expect(reviewUpdateSchema.parse({ id: "review_1", locale: "fa" }).locale).toBe("fa");
  });
});
