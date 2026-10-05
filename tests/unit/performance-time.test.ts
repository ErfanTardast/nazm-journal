import { describe, expect, it } from "vitest";
import { dayKey, periodRange, shiftDay, startOfDay, weekdayOf } from "@/lib/calculations/performance/time";

const NOW = new Date("2026-10-04T10:00:00Z");

describe("dayKey", () => {
  it("reads the wall clock in the zone, not in UTC", () => {
    expect(dayKey("2026-10-03T21:00:00Z", "UTC")).toBe("2026-10-03");
    // Tehran is UTC+3:30 all year, so 21:00Z is already 00:30 the next day.
    expect(dayKey("2026-10-03T21:00:00Z", "Asia/Tehran")).toBe("2026-10-04");
    expect(dayKey(new Date("2026-10-03T20:29:59Z"), "Asia/Tehran")).toBe("2026-10-03");
    expect(dayKey("2026-10-03T20:30:00Z", "Asia/Tehran")).toBe("2026-10-04");
  });

  it("follows a summer-time switch", () => {
    // New York is UTC-4 in October and UTC-5 after the switch on 1 Nov 2026.
    expect(dayKey("2026-10-10T03:30:00Z", "America/New_York")).toBe("2026-10-09");
    expect(dayKey("2026-11-10T04:30:00Z", "America/New_York")).toBe("2026-11-09");
    expect(dayKey("2026-11-10T05:00:00Z", "America/New_York")).toBe("2026-11-10");
  });

  it("understands the broker's New York close convention", () => {
    // New York time + 7 hours: UTC+3 in October, so 21:00Z is midnight.
    expect(dayKey("2026-10-10T20:59:00Z", "mt5:new-york-close")).toBe("2026-10-10");
    expect(dayKey("2026-10-10T21:00:00Z", "mt5:new-york-close")).toBe("2026-10-11");
  });
});

describe("startOfDay", () => {
  it("is the instant the day starts in the zone", () => {
    expect(startOfDay("2026-09-28", "Asia/Tehran").toISOString()).toBe("2026-09-27T20:30:00.000Z");
    expect(startOfDay("2026-09-28", "UTC").toISOString()).toBe("2026-09-28T00:00:00.000Z");
    expect(startOfDay("2026-11-02", "America/New_York").toISOString()).toBe("2026-11-02T05:00:00.000Z");
  });

  it("is the inverse of dayKey", () => {
    for (const zone of ["UTC", "Asia/Tehran", "America/New_York", "Europe/London", "mt5:new-york-close"]) {
      const start = startOfDay("2026-10-04", zone);
      expect(dayKey(start, zone)).toBe("2026-10-04");
      expect(dayKey(new Date(start.getTime() - 1), zone)).toBe("2026-10-03");
    }
  });

  it("refuses a malformed day", () => {
    expect(() => startOfDay("2026-10", "UTC")).toThrow();
  });
});

describe("shiftDay and weekdayOf", () => {
  it("moves a day key across month and year ends", () => {
    expect(shiftDay("2026-10-04", -6)).toBe("2026-09-28");
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDay("2026-10-04", 0)).toBe("2026-10-04");
  });

  it("numbers weekdays from Sunday", () => {
    expect(weekdayOf("2026-10-04")).toBe(0);
    expect(weekdayOf("2026-10-05")).toBe(1);
    expect(weekdayOf("2026-10-10")).toBe(6);
  });
});

describe("periodRange", () => {
  it("starts the 7-day window at the start of the day six days back, in the trader's zone", () => {
    const tehran = periodRange("7d", NOW, "Asia/Tehran");
    expect(tehran.from?.toISOString()).toBe("2026-09-27T20:30:00.000Z");
    expect(tehran.to).toEqual(NOW);
    expect(periodRange("7d", NOW, "UTC").from?.toISOString()).toBe("2026-09-28T00:00:00.000Z");
  });

  it("covers today and the days before for 30 and 90 days", () => {
    expect(periodRange("30d", NOW, "UTC").from?.toISOString()).toBe("2026-09-05T00:00:00.000Z");
    expect(periodRange("90d", NOW, "UTC").from?.toISOString()).toBe("2026-07-07T00:00:00.000Z");
  });

  it("has no start for all time", () => {
    expect(periodRange("all", NOW, "Asia/Tehran")).toEqual({ from: null, to: NOW });
  });

  it("takes today from the zone, not from UTC", () => {
    // 21:00Z is already the next day in Tehran, so the 7-day window starts a day later there.
    const late = new Date("2026-10-04T21:00:00Z");
    expect(periodRange("7d", late, "Asia/Tehran").from?.toISOString()).toBe("2026-09-28T20:30:00.000Z");
    expect(periodRange("7d", late, "UTC").from?.toISOString()).toBe("2026-09-28T00:00:00.000Z");
  });
});
