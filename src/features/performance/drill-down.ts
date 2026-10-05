import { DIMENSIONS, PERIODS, type Dimension, type PeriodKey } from "@/lib/calculations/performance/types";
import type { Locale } from "@/lib/i18n/locales";

/**
 * The link from a Performance breakdown row to the journal: three query parameters (the window, the breakdown and
 * the row's id from the report) that GET /api/performance/trades turns into the trades behind the row.
 */
export type DrillDown = { period: PeriodKey; dimension: Dimension; row: string };

const MAX_ROW_LENGTH = 200; // the same ceiling as the route

export function drillDownHref(locale: Locale, drill: DrillDown): string {
  return `/${locale}/journal?period=${drill.period}&dimension=${drill.dimension}&row=${encodeURIComponent(drill.row)}`;
}

/** The drill-down a journal URL asks for; null unless all three parameters are there and valid (then the journal is shown whole). */
export function parseDrillDown(params: { get(name: string): string | null } | null | undefined): DrillDown | null {
  const period = params?.get("period") ?? null;
  const dimension = params?.get("dimension") ?? null;
  const row = params?.get("row") ?? null;
  if (!period || !dimension || !row || row.length > MAX_ROW_LENGTH) return null;
  if (!(PERIODS as readonly string[]).includes(period) || !(DIMENSIONS as readonly string[]).includes(dimension)) return null;
  return { period: period as PeriodKey, dimension: dimension as Dimension, row };
}
