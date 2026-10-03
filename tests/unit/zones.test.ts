import { describe, expect, it } from "vitest";
import { isSupportedTimeZone, NEW_YORK_CLOSE, reinterpretWallTime, timeZoneLabel, wallTimeToUtc } from "@/lib/time/zones";

const iso = (value: Date | null) => value?.toISOString() ?? null;

describe("wallTimeToUtc", () => {
  it("reads MT5 server time on the New York close convention: UTC+3 while the US is on summer time", () => {
    expect(iso(wallTimeToUtc("2026-08-29T20:04:44", NEW_YORK_CLOSE))).toBe("2026-08-29T17:04:44.000Z");
  });

  it("uses UTC+2 for that convention in winter", () => {
    expect(iso(wallTimeToUtc("2026-01-15T10:00:00", NEW_YORK_CLOSE))).toBe("2026-01-15T08:00:00.000Z");
  });

  it("follows the US switch dates, not Europe's", () => {
    // US summer time starts 2026-03-08, Europe's on 2026-03-29: New York close is already UTC+3 on the 10th.
    expect(iso(wallTimeToUtc("2026-03-10T12:00:00", NEW_YORK_CLOSE))).toBe("2026-03-10T09:00:00.000Z");
  });

  it("reads a named zone and a fixed offset", () => {
    expect(iso(wallTimeToUtc("2026-08-29T20:04:44", "Asia/Tehran"))).toBe("2026-08-29T16:34:44.000Z");
    // IANA's Etc/GMT-2 is UTC+2 (the sign is inverted in those names).
    expect(iso(wallTimeToUtc("2026-08-29 20:00", "Etc/GMT-2"))).toBe("2026-08-29T18:00:00.000Z");
    expect(iso(wallTimeToUtc("2026-08-29T20:00:00", "UTC"))).toBe("2026-08-29T20:00:00.000Z");
  });

  it("returns null for text that is not a zone-less date and time", () => {
    expect(wallTimeToUtc("2026-08-29T20:00:00Z", "UTC")).toBeNull();
    expect(wallTimeToUtc("yesterday", "UTC")).toBeNull();
  });
});

describe("reinterpretWallTime", () => {
  it("moves a time that was read in the wrong zone to the broker's", () => {
    // Imported on a Tehran machine before the setting existed: 20:04:44 broker time was stored as 16:34:44Z.
    expect(iso(reinterpretWallTime(new Date("2026-08-29T16:34:44Z"), "Asia/Tehran", NEW_YORK_CLOSE))).toBe("2026-08-29T17:04:44.000Z");
  });
});

describe("isSupportedTimeZone", () => {
  it("accepts the New York close convention and real zones, and nothing else", () => {
    expect(isSupportedTimeZone(NEW_YORK_CLOSE)).toBe(true);
    expect(isSupportedTimeZone("Asia/Tehran")).toBe(true);
    expect(isSupportedTimeZone("Etc/GMT-3")).toBe(true);
    expect(isSupportedTimeZone("Mars/Base")).toBe(false);
    expect(isSupportedTimeZone("")).toBe(false);
  });
});

describe("timeZoneLabel", () => {
  it("names the convention and fixed offsets the way a trader reads them", () => {
    expect(timeZoneLabel(NEW_YORK_CLOSE, "en")).toBe("New York close (UTC+2 winter / UTC+3 summer)");
    expect(timeZoneLabel("Etc/GMT-3", "en")).toBe("UTC+3");
    expect(timeZoneLabel("Asia/Tehran", "en")).toBe("Asia/Tehran");
  });
});
