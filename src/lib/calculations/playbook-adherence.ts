/**
 * Phase Epsilon — playbook (strategy) adherence. Pure, read-only aggregation: given the operator's
 * strategies (playbooks) and their tagged trades, compute how often trades followed the playbook
 * rules and surface the playbook's declared common mistakes. No DB, no network, no prediction.
 */
export type RuleFollowStatus = "followed" | "broken" | "mixed" | "unknown";

export type PlaybookInput = { id: string; name: string; commonMistakes?: string[] | null };
export type AdherenceTradeInput = {
  strategyId: string | null;
  ruleFollowed: RuleFollowStatus;
  rMultiple?: number | null;
};

export type PlaybookAdherence = {
  strategyId: string;
  name: string;
  tradeCount: number;
  assessedCount: number; // followed + broken + mixed (excludes "unknown")
  followedCount: number;
  brokenCount: number;
  mixedCount: number;
  adherenceRate: number | null; // followed / assessed; null when nothing is assessed
  avgRMultiple: number | null;
  topMistake: string | null; // the playbook's first declared common mistake
  commonMistakes: string[];
};

export function calculatePlaybookAdherence(
  strategies: PlaybookInput[],
  trades: AdherenceTradeInput[]
): PlaybookAdherence[] {
  const byStrategy = new Map<string, AdherenceTradeInput[]>();
  for (const t of trades) {
    if (!t.strategyId) continue; // unplanned / no playbook
    const list = byStrategy.get(t.strategyId);
    if (list) list.push(t);
    else byStrategy.set(t.strategyId, [t]);
  }

  const out = strategies.map((s): PlaybookAdherence => {
    const ts = byStrategy.get(s.id) ?? [];
    const followedCount = ts.filter((t) => t.ruleFollowed === "followed").length;
    const brokenCount = ts.filter((t) => t.ruleFollowed === "broken").length;
    const mixedCount = ts.filter((t) => t.ruleFollowed === "mixed").length;
    const assessedCount = followedCount + brokenCount + mixedCount;
    const rs = ts.map((t) => t.rMultiple).filter((r): r is number => typeof r === "number" && Number.isFinite(r));
    const commonMistakes = (s.commonMistakes ?? []).filter((m) => typeof m === "string" && m.length > 0);
    return {
      strategyId: s.id,
      name: s.name,
      tradeCount: ts.length,
      assessedCount,
      followedCount,
      brokenCount,
      mixedCount,
      adherenceRate: assessedCount > 0 ? followedCount / assessedCount : null,
      avgRMultiple: rs.length > 0 ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
      topMistake: commonMistakes[0] ?? null,
      commonMistakes
    };
  });

  out.sort((a, b) => b.tradeCount - a.tradeCount || a.name.localeCompare(b.name));
  return out;
}
