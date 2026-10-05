import { wallTimeToUtc, zoneOffsetMinutes } from "@/lib/time/zones";
import type { PeriodKey } from "./types";

/**
 * Days as the trader lives them: a "day key" is the calendar date on the wall clock of the trader's time zone
 * (User.timezone, or the broker convention), so a trade at 00:30 in Tehran belongs to its own day, not to the
 * UTC day before.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "YYYY-MM-DD" of the wall clock in the zone at that instant. */
export function dayKey(at: Date | string, timeZone: string): string {
  const date = typeof at === "string" ? new Date(at) : at;
  return new Date(date.getTime() + zoneOffsetMinutes(timeZone, date) * 60_000).toISOString().slice(0, 10);
}

/** The instant that day starts in the zone. */
export function startOfDay(day: string, timeZone: string): Date {
  const start = DAY_KEY.test(day) ? wallTimeToUtc(`${day}T00:00`, timeZone) : null;
  if (!start) throw new Error(`Not a day: ${day}`);
  return start;
}

function dayToUtc(day: string) {
  const match = DAY_KEY.exec(day);
  if (!match) throw new Error(`Not a day: ${day}`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** The day key `days` days later (earlier when negative); calendar days, so it ignores summer-time switches. */
export function shiftDay(day: string, days: number): string {
  return new Date(dayToUtc(day) + days * DAY_MS).toISOString().slice(0, 10);
}

/** 0 = Sunday. */
export function weekdayOf(day: string): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  return new Date(dayToUtc(day)).getUTCDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

const PERIOD_DAYS: Record<Exclude<PeriodKey, "all">, number> = { "7d": 7, "30d": 30, "90d": 90 };

/** "7d" is today and the 6 days before, from the start of that day in the zone; "all" has no start. */
export function periodRange(period: PeriodKey, now: Date, timeZone: string): { from: Date | null; to: Date } {
  if (period === "all") return { from: null, to: now };
  return { from: startOfDay(shiftDay(dayKey(now, timeZone), 1 - PERIOD_DAYS[period]), timeZone), to: now };
}
