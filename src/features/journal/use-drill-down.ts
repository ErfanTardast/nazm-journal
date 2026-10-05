"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api/client";
import { parseDrillDown, type DrillDown } from "@/features/performance/drill-down";

export type DrillDownTrades =
  | { status: "none"; drill: null; ids: null }
  /** Asked, no answer yet: no trade is listed meanwhile. */
  | { status: "loading"; drill: DrillDown; ids: Set<string> }
  | { status: "ready"; drill: DrillDown; ids: Set<string> }
  /** The answer did not come: the journal lists every trade. */
  | { status: "failed"; drill: DrillDown; ids: null };

type Answer = { key: string; ids: string[] | null };

/**
 * The journal opened from a Performance row: reads the three parameters of the address and asks
 * GET /api/performance/trades for the ids of the trades behind the row. Without all three (valid) it does nothing.
 */
export function useDrillDown(): DrillDownTrades {
  const params = useSearchParams();
  const parsed = parseDrillDown(params);
  const [period, dimension, row] = [parsed?.period, parsed?.dimension, parsed?.row];
  const drill = useMemo(() => (period && dimension && row ? { period, dimension, row } : null), [period, dimension, row]);
  const key = drill ? `${drill.period}|${drill.dimension}|${drill.row}` : null;
  const [answer, setAnswer] = useState<Answer | null>(null);

  useEffect(() => {
    if (!drill || !key) return;
    let current = true;
    const query = `period=${drill.period}&dimension=${drill.dimension}&row=${encodeURIComponent(drill.row)}`;
    apiFetch<{ tradeIds: string[] }>(`/api/performance/trades?${query}`)
      .then((data) => {
        if (current) setAnswer({ key, ids: data.tradeIds });
      })
      .catch(() => {
        if (current) setAnswer({ key, ids: null });
      });
    return () => {
      current = false;
    };
  }, [drill, key]);

  return useMemo((): DrillDownTrades => {
    if (!drill || !key) return { status: "none", drill: null, ids: null };
    if (answer?.key !== key) return { status: "loading", drill, ids: new Set() };
    return answer.ids ? { status: "ready", drill, ids: new Set(answer.ids) } : { status: "failed", drill, ids: null };
  }, [answer, drill, key]);
}
