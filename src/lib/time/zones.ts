/**
 * Wall-clock times in a time zone, for data that carries none: MT5 reports print the broker's server time
 * ("YYYY.MM.DD HH:MM:SS") with no zone.
 */

/**
 * The common MT5 server-time convention: New York time + 7 hours, so the New York 17:00 close is midnight
 * (UTC+2 in winter, UTC+3 while the US is on summer time; it follows the US switch dates).
 */
export const NEW_YORK_CLOSE = "mt5:new-york-close";

/** Broker server-time choices offered in Settings (most MT5 brokers use the New York close convention). */
export const BROKER_TIME_ZONES = [NEW_YORK_CLOSE, "Etc/GMT-2", "Etc/GMT-3", "UTC", "Europe/London"] as const;

/** How a trader reads the zone: the convention by name, IANA "Etc/GMT-3" as UTC+3 (its sign is inverted). */
export function timeZoneLabel(zone: string, locale: "en" | "fa") {
  if (zone === NEW_YORK_CLOSE) {
    return locale === "fa" ? "بسته شدن بازار نیویورک (UTC+2 زمستان / UTC+3 تابستان)" : "New York close (UTC+2 winter / UTC+3 summer)";
  }
  const fixed = /^Etc\/GMT([+-])(\d{1,2})$/.exec(zone);
  if (fixed) return `UTC${fixed[1] === "-" ? "+" : "-"}${fixed[2]}`;
  return zone;
}

const WALL_TIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;

export function isSupportedTimeZone(zone: string) {
  if (zone === NEW_YORK_CLOSE) return true;
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Minutes to add to UTC for the zone's wall clock at that instant. */
export function zoneOffsetMinutes(zone: string, at: Date): number {
  if (zone === NEW_YORK_CLOSE) return zoneOffsetMinutes("America/New_York", at) + 7 * 60;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  const wall = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
  return Math.round((wall - at.getTime()) / 60_000);
}

/** The instant of a zone-less "YYYY-MM-DD[T ]HH:MM[:SS]" read in the zone, or null for any other text. */
export function wallTimeToUtc(local: string, zone: string): Date | null {
  const match = WALL_TIME.exec(local.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  const asUtc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0));
  // The offset depends on the instant being found: guess with the offset at the wall time read as UTC, then
  // correct with the offset at the guess (settles across a summer-time switch).
  const guess = asUtc - zoneOffsetMinutes(zone, new Date(asUtc)) * 60_000;
  return new Date(asUtc - zoneOffsetMinutes(zone, new Date(guess)) * 60_000);
}

/** A time stored as if its wall clock were in \`from\`, moved to the same wall clock read in \`to\`. */
export function reinterpretWallTime(stored: Date, from: string, to: string): Date {
  const wall = new Date(stored.getTime() + zoneOffsetMinutes(from, stored) * 60_000).toISOString().slice(0, 19);
  return wallTimeToUtc(wall, to) ?? stored;
}
