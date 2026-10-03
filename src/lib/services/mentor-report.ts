import { getTradeMetrics } from "@/lib/services/trades";
import { getPlaybookAdherence } from "@/lib/services/playbook-adherence";
import { getDisciplineOverview } from "@/lib/services/discipline";
import { buildMentorReport, type MentorReport } from "@/lib/calculations/mentor-report";
import type { Locale } from "@/lib/i18n/locales";

/**
 * Read-only: assemble a share-safe mentor report from the user's trade metrics, playbook adherence,
 * and discipline. No writes. `hidePnl` redacts money figures for sharing process-only stats.
 */
export async function getMentorReport(
  userId: string,
  options: { period?: string; hidePnl?: boolean; locale?: Locale } = {}
): Promise<MentorReport> {
  // getTradeMetrics covers every closed trade, so the default period must say "all time", not a window.
  const { hidePnl = false, locale = "en" } = options;
  const period = options.period ?? (locale === "fa" ? "کل دوره" : "all time");
  const [metrics, adherence, discipline] = await Promise.all([
    getTradeMetrics(userId),
    getPlaybookAdherence(userId),
    getDisciplineOverview(userId)
  ]);
  const topPlaybook = adherence.find((p) => p.adherenceRate != null) ?? null;

  return buildMentorReport(
    {
      period,
      metrics: {
        totalTrades: metrics.totalTrades,
        winRate: metrics.winRate,
        avgRMultiple: metrics.averageR,
        profitFactor: metrics.profitFactor,
        netPnl: metrics.netPnl
      },
      disciplineGrade: discipline.disciplineScore?.grade ?? null,
      topPlaybook: topPlaybook
        ? { name: topPlaybook.name, adherenceRate: topPlaybook.adherenceRate, avgRMultiple: topPlaybook.avgRMultiple }
        : null,
      topMistake: discipline.mistakePatterns?.[0]?.mistake ?? null
    },
    { hidePnl, locale }
  );
}
