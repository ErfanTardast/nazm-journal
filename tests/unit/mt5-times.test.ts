import { describe, expect, it } from "vitest";
import { mt5TimesFromImportRow } from "@/lib/import/mt5-times";
import { NEW_YORK_CLOSE } from "@/lib/time/zones";

describe("mt5TimesFromImportRow", () => {
  it("reads the raw report times through the import's mapping, in the broker zone", () => {
    const times = mt5TimesFromImportRow({ opened: "2026-08-29T20:04:44", closed: "2026-08-29T20:30:00" }, { openedAt: "opened", closedAt: "closed" }, NEW_YORK_CLOSE);

    expect(times?.openedAt.toISOString()).toBe("2026-08-29T17:04:44.000Z");
    expect(times?.closedAt?.toISOString()).toBe("2026-08-29T17:30:00.000Z");
  });

  it("falls back to the standard column names when the mapping has none", () => {
    expect(mt5TimesFromImportRow({ openedAt: "2026-08-29T20:04:44" }, null, "UTC")?.openedAt.toISOString()).toBe("2026-08-29T20:04:44.000Z");
  });

  it("returns null when no zone-less open time can be found", () => {
    expect(mt5TimesFromImportRow({ opened: "2026-08-29T20:04:44" }, { openedAt: "missing" }, "UTC")).toBeNull();
    expect(mt5TimesFromImportRow({ openedAt: "2026-08-29T17:04:44.000Z" }, null, "UTC")).toBeNull();
  });
});
