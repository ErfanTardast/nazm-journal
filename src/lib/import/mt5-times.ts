import { wallTimeToUtc } from "@/lib/time/zones";

/**
 * An imported MT5 position's open/close times recomputed from its import row: the raw report value (a
 * zone-less broker time) found through the import's column mapping, read in the broker zone. Null when no
 * zone-less open time is found (e.g. a row imported from an ordinary CSV).
 */
export function mt5TimesFromImportRow(raw: Record<string, unknown>, mapping: Record<string, unknown> | null, zone: string) {
  const column = (field: "openedAt" | "closedAt") => (typeof mapping?.[field] === "string" ? (mapping[field] as string) : field);
  const read = (field: "openedAt" | "closedAt") => {
    const value = raw[column(field)];
    return typeof value === "string" ? wallTimeToUtc(value, zone) : null;
  };
  const openedAt = read("openedAt");
  return openedAt ? { openedAt, closedAt: read("closedAt") } : null;
}
