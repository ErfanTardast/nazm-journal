const DAY = 24 * 60 * 60 * 1000;

/** Midnight UTC of the day `date` falls on, in milliseconds. */
export function utcMidnight(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

const isWeekday = (midnight: number) => {
  const day = new Date(midnight).getUTCDay();
  return day !== 0 && day !== 6;
};

/**
 * The `count` most recent trading days (Monday to Friday) before the day `now` falls on, oldest first, as midnights in
 * UTC. The last one is the day before `now`, or the Friday before when that day is a weekend, so the month always
 * ends on the last day the market was open. Twenty of them reach back at most 29 days.
 */
export function tradingDaysBefore(now: Date, count: number): number[] {
  const days: number[] = [];
  for (let cursor = utcMidnight(now) - DAY; days.length < count; cursor -= DAY) {
    if (isWeekday(cursor)) days.push(cursor);
  }
  return days.reverse();
}

/** `time` is "HH:MM". */
export function atTime(midnight: number, time: string, addMinutes = 0): Date {
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(midnight + (hours * 60 + minutes + addMinutes) * 60_000);
}

/** The Monday-to-Sunday week (UTC) that contains `date`, as the product's weekly reviews cover it. */
export function utcWeek(date: Date): { start: Date; end: Date } {
  const midnight = utcMidnight(date);
  const day = new Date(midnight).getUTCDay();
  const start = midnight - (day === 0 ? 6 : day - 1) * DAY;
  return { start: new Date(start), end: new Date(start + 7 * DAY - 1) };
}

/** The whole UTC day `date` falls on, as the product's daily reviews cover it. */
export function utcDay(date: Date): { start: Date; end: Date } {
  const start = utcMidnight(date);
  return { start: new Date(start), end: new Date(start + DAY - 1) };
}

/** YYYY-MM-DD of a date in UTC. */
export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}
