export type AnalyticsTrade = {
  realizedPnl?: number | null;
  rMultiple?: number | null;
};

export type AnalyticsGroup = {
  key: string;
  count: number;
  wins: number;
  losses: number;
  breakeven: number;
  decided: number;
  winRate: number;
  netPnl: number;
  avgR: number;
  hasR: boolean;
};

/**
 * Aggregates trades into one row per dimension value (strategy, session, setup, etc.).
 * Win rate is measured over decided trades (wins + losses); breakeven and pending
 * trades are excluded from the rate so it reflects resolved outcomes only.
 */
export function summarizeBy<T extends AnalyticsTrade>(items: T[], getKey: (item: T) => string | null | undefined, fallback = "Unspecified"): AnalyticsGroup[] {
  const map = new Map<string, AnalyticsGroup & { rSum: number; rCount: number }>();

  for (const item of items) {
    const rawKey = getKey(item);
    const key = rawKey && rawKey.trim() ? rawKey.trim() : fallback;
    const group = map.get(key) ?? { key, count: 0, wins: 0, losses: 0, breakeven: 0, decided: 0, winRate: 0, netPnl: 0, avgR: 0, hasR: false, rSum: 0, rCount: 0 };

    group.count += 1;
    const pnl = toFiniteNumber(item.realizedPnl);
    group.netPnl += pnl;
    if (pnl > 0) {
      group.wins += 1;
    } else if (pnl < 0) {
      group.losses += 1;
    } else {
      group.breakeven += 1;
    }

    const r = item.rMultiple;
    if (r !== null && r !== undefined && Number.isFinite(Number(r))) {
      group.rSum += Number(r);
      group.rCount += 1;
    }

    map.set(key, group);
  }

  return [...map.values()]
    .map((group) => {
      group.decided = group.wins + group.losses;
      group.winRate = group.decided > 0 ? group.wins / group.decided : 0;
      group.hasR = group.rCount > 0;
      group.avgR = group.rCount > 0 ? group.rSum / group.rCount : 0;
      const { rSum: _rSum, rCount: _rCount, ...clean } = group;
      void _rSum;
      void _rCount;
      return clean;
    })
    .sort((a, b) => b.netPnl - a.netPnl);
}

function toFiniteNumber(value: number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}
