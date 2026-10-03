import { toAsciiDigits } from "@/lib/validation/number-input";

/**
 * Reading an entry price out of a plan's entry zone, which is free text ("64600-65100", "1.0850 – 1.0870", "۶۴۶۰۰ تا
 * ۶۵۱۰۰", "wait for a pullback"). Pure: no wording, no database.
 *
 * The rule is "never invent a price". One number is that number; two numbers joined by a range mark are their
 * midpoint; everything else (no number, a list of numbers, a number that is really a percent, a time frame, a clock
 * time, a level or indicator setting, a take-profit or stop number, a distance or a shorthand like "65k" or
 * "۶۵ هزار") gives null, and the trader types the entry.
 */
export type PlanEntryRead = { price: number; kind: "single" | "midpoint" };

const DIRECTION_MARKS = /[\u200e\u200f\u061c\u202a-\u202e\u2066-\u2069]/g;
/** "64,600" and "۶۴٬۶۰۰": a comma or the Arabic thousands mark between proper groups of three digits (not "1,0850"). */
const THOUSANDS = /(?<![\d.,\u066c])\d{1,3}(?:[,\u066c]\d{3})+(?![\d,\u066c])/g;
const NUMBER = /\d+(?:\.\d+)?/g;
/** A decimal that starts with the point (".12", "DOGE .12"): it is 0.12, and the point is not a separator. */
const LEADING_POINT = /(?<![\d.])\.(?=\d)/g;
/** What may sit between the two prices of a range. */
const RANGE_MARK = /^(?:[-\u2010-\u2015\u2212~]|to|until|till|\u062a\u0627|\u0627\u0644\u06cc|\.\.\.?|\u2026)$/i;
const DASH_AT_START = /^[-\u2010-\u2015\u2212~]/;
const DASH_AT_END = /[-\u2010-\u2015\u2212~]$/;
/** Dots or an ellipsis next to a lone number mean an open range ("...65000", "65000…"): there is no one price. */
const DOTS_AT_START = /^\s*(?:\.\.|\u2026)/;
const DOTS_AT_END = /(?:\.\.|\u2026)\s*$/;
const LETTER = /\p{L}/u;

const alternatives = (words: string[]) => words.join("|");

/**
 * Right after a number, a percent sign or one of these words makes it a size, a distance, a time or an indicator
 * setting instead of a price: 65 k, ۶۵ هزار, 15 min, 20 pips, ۵ دقیقه, 8 am, ۱۰ صبح, کندل ۴ ساعته, 200 EMA, 61.8 fib.
 */
const AFTER_WORDS = alternatives([
  // shorthand: thousand, million, billion
  "k", "m", "b", "thousand", "million", "billion", "هزار", "میلیون", "میلیارد",
  // time frames and distances
  "min", "mins", "minute", "minutes", "h", "hr", "hrs", "hour", "hours", "d", "day", "days", "w", "week", "weeks",
  "pip", "pips", "point", "points", "tick", "ticks", "lot", "lots", "percent", "pct", "r",
  "دقیقه", "ساعت", "ساعته", "ساعتی", "روز", "روزه", "هفته", "ماه", "ماهه", "پیپ", "پوینت", "تیک", "لات", "درصد",
  // clock times: am, pm (also "a.m."), UTC and other zones, morning, noon, afternoon, night
  "am", "pm", "a\\.m\\.?", "p\\.m\\.?", "utc", "gmt", "est", "edt", "cet", "صبح", "ظهر", "عصر", "شب",
  // moving averages and retracements
  "ema", "sma", "ma", "fib", "fibo", "fibonacci", "فیبو", "فیبوناچی"
]);
const NOT_A_PRICE_AFTER = new RegExp(`^\\s*(?:[%\u066a]|(?:${AFTER_WORDS})(?!\\p{L}))`, "iu");

/**
 * Right before a number, a percent sign or one of these words makes it a label, a setting or another price level, not
 * the entry: %50, hour 8, ساعت ۱۰, wave 3, step 2, scenario 2, RSI 30, EMA 200, TP 65000, SL 1.0800, candle 3.
 */
const BEFORE_WORDS = alternatives([
  // "stop" labels a stop loss, except in the pending-order names "buy stop" and "sell stop", which carry the entry.
  "tp", "sl", "target", "(?<!(?:buy|sell)\\s+)stop", "rsi", "ema", "sma", "ma", "fib", "fibo", "fibonacci", "wave", "step", "scenario",
  "hour", "hours", "hr", "candle",
  "هدف", "ضرر", "سود", "ساعت", "کندل", "فیبو", "موج", "مرحله", "سناریو", "سناریوی"
]);
const NOT_A_PRICE_BEFORE = new RegExp(`(?:(?<![\\p{L}\\d])(?:${BEFORE_WORDS})|[%\u066a])[\\s:#=(]*$`, "iu");
/** "level 2" is a level number, "support level 1.0850" and "level 65000" are prices: only a small whole number is refused. */
const LEVEL_BEFORE = /(?<![\p{L}\d])(?:level|lvl|سطح|لول)[\s:#=]*$/iu;

/** A zone wider than double its low end is not an entry zone: it is two unrelated numbers ("10-02"). */
const MAX_RANGE_RATIO = 2;
const MAX_PRICE = 1e12;

type Token = { text: string; start: number; end: number; value: number };

function normalize(text: string) {
  return toAsciiDigits(text.replace(DIRECTION_MARKS, ""))
    .replace(/\u066b/g, ".")
    .replace(THOUSANDS, (group) => group.replace(/[,\u066c]/g, ""))
    .replace(LEADING_POINT, "0.");
}

function decimalsOf(text: string) {
  return text.split(".")[1]?.length ?? 0;
}

function tokensOf(text: string): Token[] {
  return Array.from(text.matchAll(NUMBER), (match) => ({
    text: match[0],
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
    value: Number(match[0])
  }));
}

/**
 * A number glued to a letter, next to a percent sign, a shorthand, a unit, a clock word, an indicator or a take-profit
 * or stop label, or a small level number, is not a price.
 */
function looksLikeAPrice(text: string, token: Token) {
  const before = text.slice(0, token.start);
  const after = text.slice(token.end);
  if (before && LETTER.test(before.slice(-1))) return false;
  if (after && LETTER.test(after.charAt(0))) return false;
  if (NOT_A_PRICE_AFTER.test(after) || NOT_A_PRICE_BEFORE.test(before)) return false;
  if (Number.isInteger(token.value) && !token.text.includes(".") && token.value < 100 && LEVEL_BEFORE.test(before)) return false;
  return Number.isFinite(token.value) && token.value > 0 && token.value <= MAX_PRICE;
}

export function readEntryZone(zone: string | null | undefined): PlanEntryRead | null {
  if (typeof zone !== "string") return null;
  const text = normalize(zone).trim();
  if (!text) return null;
  const tokens = tokensOf(text);

  if (tokens.length === 1) {
    const [token] = tokens;
    if (!looksLikeAPrice(text, token)) return null;
    // A dash or dots on either side is an open range or a minus sign, not a price.
    const before = text.slice(0, token.start);
    const after = text.slice(token.end);
    if (DASH_AT_END.test(before.trimEnd()) || DASH_AT_START.test(after.trimStart())) return null;
    if (DOTS_AT_END.test(before) || DOTS_AT_START.test(after)) return null;
    return { price: token.value, kind: "single" };
  }

  if (tokens.length === 2) {
    const [first, second] = tokens;
    if (!looksLikeAPrice(text, first) || !looksLikeAPrice(text, second)) return null;
    if (!RANGE_MARK.test(text.slice(first.end, second.start).trim())) return null;
    // "150.20-90" is 150.20 to 150.90 written short, and "31.20-40" is 31.20 to 31.40: a bare whole number with fewer
    // digits than the whole part before it, or no longer than that number's decimals, stands for the decimals.
    if (
      first.text.includes(".") &&
      !second.text.includes(".") &&
      (second.text.length < first.text.split(".")[0].length || second.text.length <= decimalsOf(first.text))
    ) {
      return null;
    }
    const [min, max] = first.value <= second.value ? [first.value, second.value] : [second.value, first.value];
    if (max / min > MAX_RANGE_RATIO) return null;
    // The midpoint of two prices has at most one more decimal than the longer of them; rounding there drops float noise.
    const decimals = Math.min(20, Math.max(decimalsOf(first.text), decimalsOf(second.text)) + 1);
    const price = Number(((first.value + second.value) / 2).toFixed(decimals));
    return price > 0 ? { price, kind: "midpoint" } : null;
  }

  return null;
}

/** The entry price a plan's entry zone stands for, or null when the trader has to type it. */
export function entryPriceFromZone(zone: string | null | undefined): number | null {
  return readEntryZone(zone)?.price ?? null;
}
