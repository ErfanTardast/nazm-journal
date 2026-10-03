import { describe, expect, it } from "vitest";
import { entryPriceFromZone, readEntryZone } from "@/lib/calculations/plan-entry";

describe("entryPriceFromZone: one number", () => {
  it.each([
    ["65000", 65000],
    ["1.0850", 1.085],
    ["  64,850 ", 64850],
    ["$65,000", 65000],
    ["64,850.5", 64850.5],
    ["around 65000", 65000],
    ["EURUSD 1.0850", 1.085],
    ["0.00001234", 0.00001234]
  ])("reads %j as %d", (text, price) => {
    expect(entryPriceFromZone(text)).toBe(price);
  });

  it("reads Persian digits, the Persian decimal mark and the Persian thousands mark", () => {
    expect(entryPriceFromZone("۶۵۰۰۰")).toBe(65000);
    expect(entryPriceFromZone("۱٫۰۸۵۰")).toBe(1.085);
    expect(entryPriceFromZone("۶۵٬۰۰۰")).toBe(65000);
    expect(entryPriceFromZone("حوالی ۶۵۰۰۰")).toBe(65000);
  });

  it("reads Arabic-Indic digits and ignores invisible direction marks", () => {
    expect(entryPriceFromZone("٦٥٠٠٠")).toBe(65000);
    expect(entryPriceFromZone("\u200f۱٫۰۸۵۰\u200e")).toBe(1.085);
  });

  it("says it was a single number", () => {
    expect(readEntryZone("1.0850")).toEqual({ price: 1.085, kind: "single" });
  });

  it("reads a decimal that starts with the point as that decimal, never as a whole number", () => {
    expect(entryPriceFromZone(".12")).toBe(0.12);
    expect(entryPriceFromZone(".085")).toBe(0.085);
    expect(entryPriceFromZone("DOGE .12")).toBe(0.12);
    expect(entryPriceFromZone(".10-.14")).toBe(0.12);
    expect(entryPriceFromZone("۰٫۱۲")).toBe(0.12);
    expect(entryPriceFromZone("٫۱۲")).toBe(0.12);
  });

  it("still reads a price that comes after a level, a symbol or a sentence end", () => {
    expect(entryPriceFromZone("support level 1.0850")).toBe(1.085);
    expect(entryPriceFromZone("level 65000")).toBe(65000);
    expect(entryPriceFromZone("Entry 65000.")).toBe(65000);
    expect(entryPriceFromZone("MA cross at 65000")).toBe(65000);
  });

  // "Buy stop" and "sell stop" are the names of pending orders: the number after them is the entry, not a stop loss.
  it("reads the price of a pending order named with 'stop' or 'limit'", () => {
    expect(entryPriceFromZone("buy stop 1.0850")).toBe(1.085);
    expect(entryPriceFromZone("Sell Stop 65000")).toBe(65000);
    expect(entryPriceFromZone("buy limit 1.0850")).toBe(1.085);
  });
});

describe("entryPriceFromZone: a range is its midpoint", () => {
  it.each([
    ["64600-65100", 64850],
    ["64600 - 65100", 64850],
    ["1.0850 – 1.0870", 1.086],
    ["1.0850—1.0870", 1.086],
    ["1.0850−1.0870", 1.086],
    ["64600~65100", 64850],
    ["64,600 - 65,100", 64850],
    ["Zone: 64600-65100", 64850],
    ["64600 to 65100", 64850],
    ["64600..65100", 64850],
    ["1.0850..1.0870", 1.086],
    ["65100-64600", 64850],
    ["65000-65000", 65000],
    ["0.15-0.25", 0.2],
    ["0.0100-0.0150", 0.0125],
    ["1.0001-1.0002", 1.00015],
    ["1.08505-1.08515", 1.0851]
  ])("reads %j as %d", (text, price) => {
    expect(entryPriceFromZone(text)).toBe(price);
  });

  it("reads a Persian range, with Persian digits and separators", () => {
    expect(entryPriceFromZone("۶۴۶۰۰-۶۵۱۰۰")).toBe(64850);
    expect(entryPriceFromZone("۱٫۰۸۵۰ – ۱٫۰۸۷۰")).toBe(1.086);
    expect(entryPriceFromZone("۶۴۶۰۰ تا ۶۵۱۰۰")).toBe(64850);
    expect(entryPriceFromZone("۶۴۶۰۰ الی ۶۵۱۰۰")).toBe(64850);
    expect(entryPriceFromZone("۶۴٬۶۰۰ – ۶۵٬۱۰۰")).toBe(64850);
  });

  it("does not leave floating-point noise in a midpoint", () => {
    expect(String(entryPriceFromZone("1.0850-1.0870"))).toBe("1.086");
    expect(String(entryPriceFromZone("0.7-0.9"))).toBe("0.8");
  });

  it("says it was a midpoint", () => {
    expect(readEntryZone("64600-65100")).toEqual({ price: 64850, kind: "midpoint" });
  });
});

describe("entryPriceFromZone: anything else is left to the trader", () => {
  it("returns null for empty text and text with no number", () => {
    for (const text of ["", "   ", "wait for a pullback", "no number here", "بعد از کندل تایید", "در انتظار پولبک", "-", "...", "to"]) {
      expect(entryPriceFromZone(text)).toBeNull();
    }
    expect(entryPriceFromZone(null)).toBeNull();
    expect(entryPriceFromZone(undefined)).toBeNull();
  });

  it("never turns a shorthand amount into a small price", () => {
    for (const text of ["65k", "65K", "65 k", "۶۵ هزار", "بالای ۶۵ هزار", "1.2 million", "1.2m", "۱٫۲ میلیون", "2 billion"]) {
      expect(entryPriceFromZone(text)).toBeNull();
    }
  });

  it("never reads a percent, a time frame or a distance as a price", () => {
    for (const text of ["0.5%", "۰٫۵٪", "2R", "4H close above", "M15 pullback", "15 min close", "after 4 hours", "20 pips", "۲۰ پیپ", "۵ دقیقه", "1 lot"]) {
      expect(entryPriceFromZone(text)).toBeNull();
    }
  });

  it("never reads a clock time, a session hour or a time-frame word as a price", () => {
    for (const text of [
      "London open 8 am",
      "London open 8 a.m.",
      "3 p.m",
      "8 EST",
      "8 PM",
      "10 UTC",
      "ساعت ۱۰",
      "۱۰ صبح",
      "۸ شب",
      "۱۲ ظهر",
      "۳ عصر",
      "کندل ۴ ساعته",
      "کندل ۱ روزه",
      "hour 8",
      "کندل ۴",
      "candle 3"
    ]) {
      expect(entryPriceFromZone(text), text).toBeNull();
    }
  });

  it("never reads a level number, an indicator setting or a retracement as a price", () => {
    for (const text of [
      "level 2",
      "Level 3",
      "سطح ۲",
      "RSI 30",
      "RSI(14)",
      "200 EMA retest",
      "EMA 200",
      "50 MA",
      "SMA 100",
      "%50 fib",
      "٪۵۰ فیبو",
      "61.8 fib",
      "wave 3",
      "step 2",
      "scenario 2",
      "سناریو ۲",
      "موج ۳",
      "مرحله ۲"
    ]) {
      expect(entryPriceFromZone(text), text).toBeNull();
    }
  });

  it("never reads a take-profit or stop-loss number as the entry", () => {
    for (const text of ["TP 65000", "TP1", "SL 1.0800", "target 67000", "stop 63750", "هدف ۶۷۰۰۰", "حد ضرر ۶۳۷۵۰"]) {
      expect(entryPriceFromZone(text), text).toBeNull();
    }
  });

  it("refuses a shorthand range whose second number is only the last digits", () => {
    expect(entryPriceFromZone("150.20-90")).toBeNull();
    expect(entryPriceFromZone("1.0850-70")).toBeNull();
    // The same shorthand on a two-digit price: "31.20-40" is 31.20 to 31.40, not a zone up to 40.
    for (const text of ["31.20-40", "85.20-90", "99.50-75", "75.20-80"]) expect(entryPriceFromZone(text), text).toBeNull();
    // A whole number that is longer than the decimals before it is a price of its own.
    expect(entryPriceFromZone("64600.5-64700")).toBe(64650.25);
    expect(entryPriceFromZone("99.5-100")).toBe(99.75);
    expect(entryPriceFromZone("2650.5-2660")).toBe(2655.25);
    // A descending range with decimals on both ends is still a range.
    expect(entryPriceFromZone("10.5-9.8")).toBe(10.15);
    expect(entryPriceFromZone("105-95")).toBe(100);
  });

  it("refuses an open range written with dots", () => {
    for (const text of ["...65000", "65000...", "65000…", "..5", "…65000"]) {
      expect(entryPriceFromZone(text), text).toBeNull();
    }
  });

  it("refuses text with more than one price that is not a range", () => {
    for (const text of ["64600 or 65100", "64600, 65100", "64600 and 65100", "64600/65100", "64600-65100-65600", "64600-65100 (4H)", "retest 65000 then 64500", "1.0850 or 1.0900"]) {
      expect(entryPriceFromZone(text)).toBeNull();
    }
  });

  it("refuses dates, decimal commas and open ranges", () => {
    for (const text of ["2026-10-02", "10-02", "1,0850", "65000-", "-65000", "65000 -"]) {
      expect(entryPriceFromZone(text)).toBeNull();
    }
  });

  it("refuses zero, a range that starts at zero and numbers glued to letters", () => {
    for (const text of ["0", "0.0", "0-65000", "65000USDT", "BTC65000", "1e5"]) {
      expect(entryPriceFromZone(text)).toBeNull();
    }
  });

  it("refuses a range that is not a plausible zone", () => {
    expect(entryPriceFromZone("100-300")).toBeNull();
    expect(entryPriceFromZone("1-50000")).toBeNull();
  });

  it("refuses numbers too large to be a price", () => {
    expect(entryPriceFromZone("9".repeat(30))).toBeNull();
  });

  it("only ever answers with a finite positive price, whatever the text", () => {
    const odd = ["..", "-.-", "1..2", "1.2.3", "٫٫", "۰", "٠٠٠", "--65000--", "~", "65000 ~ ", " ~ 65000", "1-1-1", "\u0000", "0.0.0-1", "٬٬٬", "1 000 000", "NaN", "Infinity", "-Infinity", "1/0"];
    for (const text of odd) {
      const price = entryPriceFromZone(text);
      expect(price === null || (Number.isFinite(price) && price > 0)).toBe(true);
    }
  });
});
