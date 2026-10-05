import type { BreakdownLabel, PerformanceEntry, SessionKey } from "./types";

type Word = "london" | "new_york" | "asia" | "overlap";

/** Whole words a trader writes for a session, in English and Persian. Anything outside this list is the trader's own text. */
const WORDS = new Map<string, Word>([
  ["london", "london"],
  ["لندن", "london"],
  ["newyork", "new_york"],
  ["ny", "new_york"],
  ["nyc", "new_york"],
  ["نیویورک", "new_york"],
  ["asia", "asia"],
  ["asian", "asia"],
  ["tokyo", "asia"],
  ["sydney", "asia"],
  ["آسیا", "asia"],
  ["آسیایی", "asia"],
  ["اسیا", "asia"],
  ["توکیو", "asia"],
  ["سیدنی", "asia"],
  ["overlap", "overlap"],
  ["همپوشانی", "overlap"]
]);

/** Words that carry nothing: "London session", "سشن لندن", "London and NY". */
const FILLER = new Set(["session", "sessions", "and", "the", "سشن", "و"]);

/** The Arabic letters a keyboard can type for Persian ones: yeh (U+064A), alef maksura (U+0649) and kaf (U+0643). */
const PERSIAN_LETTER = new Map([
  [0x64a, "ی"],
  [0x649, "ی"],
  [0x643, "ک"]
]);

/** Lower case, Persian letters, no half-spaces or direction marks, "new york" and "n.y." as one word, split on anything else. */
function wordsOf(text: string): string[] {
  const folded = [...text.normalize("NFKC").toLowerCase()].map((letter) => PERSIAN_LETTER.get(letter.codePointAt(0) ?? 0) ?? letter).join("");
  return folded
    .replace(/\p{Cf}/gu, " ")
    .replace(/new[\s._-]*york/g, "newyork")
    .replace(/\bn[\s.]*y\b/g, "ny")
    .replace(/نیو[\s._-]*یورک/g, "نیویورک")
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter(Boolean);
}

/** The session a trader's text names, or null when it names something else (or two sessions that are not an overlap). */
function knownSession(text: string): SessionKey | null {
  const kinds = new Set<Word>();
  for (const word of wordsOf(text)) {
    if (FILLER.has(word)) continue;
    const kind = WORDS.get(word);
    if (!kind) return null;
    kinds.add(kind);
  }
  if (!kinds.size) return null;
  const [london, newYork] = [kinds.has("london"), kinds.has("new_york")];
  if (kinds.has("asia")) return kinds.size === 1 ? "asia" : null;
  if (kinds.has("overlap")) return london === newYork ? "london_new_york" : null; // "overlap" alone, or with both
  if (london && newYork) return "london_new_york";
  return london ? "london" : newYork ? "new_york" : null;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Minutes since midnight on the wall clock of an IANA zone at that instant (summer time included). */
function minuteOfDay(zone: string, at: Date): number {
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", hour: "2-digit", minute: "2-digit" });
    formatters.set(zone, formatter);
  }
  const parts = formatter.formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  return (part("hour") % 24) * 60 + part("minute");
}

const inWindow = (minute: number, fromHour: number, toHour: number) => minute >= fromHour * 60 && minute < toHour * 60;

/**
 * The session an instant falls in, by the wall clocks of the three markets: London 08:00-16:59 in Europe/London,
 * New York 08:00-16:59 in America/New_York, Tokyo 09:00-17:59 in Asia/Tokyo. Both western ones at once is the
 * overlap; Asia is Tokyo's hours when neither of them is open (London wins the hour it shares with Tokyo in
 * winter); anything else is off hours. The zones are IANA, so summer time moves each window on its own dates.
 */
function sessionAt(at: Date): SessionKey {
  const london = inWindow(minuteOfDay("Europe/London", at), 8, 17);
  const newYork = inWindow(minuteOfDay("America/New_York", at), 8, 17);
  if (london && newYork) return "london_new_york";
  if (london) return "london";
  if (newYork) return "new_york";
  return inWindow(minuteOfDay("Asia/Tokyo", at), 9, 18) ? "asia" : "off_hours";
}

/** The trader's session word normalized, or the session of the open time (derived: true) when there is none. */
export function sessionOf(entry: PerformanceEntry): { label: BreakdownLabel; derived: boolean } {
  const text = entry.first.session?.trim() ?? "";
  if (text) {
    const known = knownSession(text);
    return { label: known ? { kind: "key", key: `session.${known}` } : { kind: "text", text }, derived: false };
  }
  const opened = new Date(entry.openedAt);
  if (Number.isNaN(opened.getTime())) return { label: { kind: "key", key: "none" }, derived: false };
  return { label: { kind: "key", key: `session.${sessionAt(opened)}` }, derived: true };
}
