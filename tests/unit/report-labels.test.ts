import { describe, expect, it } from "vitest";
import { breakdownLabel } from "@/features/performance/report-labels";
import type { BreakdownLabel, LabelKey } from "@/lib/calculations/performance/types";

const KEYS: LabelKey[] = [
  "none",
  "market.crypto", "market.forex", "market.stocks",
  "side.long", "side.short",
  "session.asia", "session.london", "session.new_york", "session.london_new_york", "session.off_hours",
  "weekday.0", "weekday.1", "weekday.2", "weekday.3", "weekday.4", "weekday.5", "weekday.6",
  "setup.from_plan"
];
const key = (value: LabelKey): BreakdownLabel => ({ kind: "key", key: value });

describe("breakdownLabel", () => {
  it("writes every key in English words", () => {
    expect(KEYS.map((value) => breakdownLabel(key(value), "en"))).toEqual([
      "Unspecified",
      "Crypto", "Forex", "Global Stocks",
      "Long", "Short",
      "Asia", "London", "New York", "London–New York overlap", "Outside the main sessions",
      "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
      "From a plan"
    ]);
  });

  it("writes every key in Persian words, none of them left in English", () => {
    const words = KEYS.map((value) => breakdownLabel(key(value), "fa"));
    expect(words).toEqual([
      "نامشخص",
      "کریپتو", "فارکس", "سهام جهانی",
      "لانگ", "شورت",
      "آسیا", "لندن", "نیویورک", "همپوشانی لندن و نیویورک", "خارج از سشن‌های اصلی",
      "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه",
      "از روی پلن"
    ]);
    for (const word of words) expect(word).not.toMatch(/[A-Za-z]/);
  });

  it("keeps the trader's own words exactly as they wrote them", () => {
    expect(breakdownLabel({ kind: "text", text: "Late entry" }, "fa")).toBe("Late entry");
    expect(breakdownLabel({ kind: "text", text: "ورود دیرهنگام" }, "en")).toBe("ورود دیرهنگام");
  });
});
