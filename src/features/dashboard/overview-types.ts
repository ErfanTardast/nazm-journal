import type { PerformanceSnapshot } from "@/lib/calculations/performance/types";
import type { TodayRisk } from "@/lib/calculations/today-risk";
import type { WeekFocus } from "@/lib/calculations/week-focus";

export type ReadinessAction = "review" | "risk" | "plan" | "journal" | "ready";
export type ReadinessCheck = {
  key: "plan" | "risk" | "review" | "rules" | "journal";
  passed: boolean;
  count: number;
};

export type PlanSummary = {
  id: string;
  symbol: string;
  market: string;
  bias: string;
  status: string;
  /** ISO time the plan is for; null when the plan has no date. */
  plannedFor?: string | null;
  invalidationRule: string | null;
  riskPercent: number | null;
};

export type PlansOverview = { todayCount: number; activeCount: number; completeCount: number; next: PlanSummary | null };

export type ReviewTasks = {
  openCount: number;
  overdueCount: number;
  next: { id: string; title: string; type?: string; periodEnd: string } | null;
};

export type RecentTrade = {
  id: string;
  symbol: string;
  side: "long" | "short";
  status: "open" | "closed";
  /** ISO close time; null for a trade that is still open. */
  closedAt: string | null;
  realizedPnl: number | null;
  rMultiple: number | null;
  /** The trade has a rule verdict (the review editor's "Not reviewed" is the opposite). */
  reviewed: boolean;
};

/**
 * What GET /api/dashboard/overview answers. The blocks added in the analytics round are optional on purpose: a
 * payload from before them still renders (the screen leaves a block out when its data is missing).
 */
export type DashboardOverview = {
  /** Every trade the trader has, in any status. Older payloads sent `metrics` (closed trades only) instead. */
  tradeCount?: number;
  metrics?: { totalTrades: number; winRate: number };
  /** Trades still open. */
  openTrades: number;
  /** Older payloads: the first active plans, and how many of them are complete. */
  plannedTrades?: PlanSummary[];
  completePlanCount?: number;
  ruleViolations: number;
  journalFollowUps: number;
  riskDefaults: {
    riskPerTradePct: number;
    maxDailyLossPct: number;
    maxWeeklyLossPct: number;
    valid: boolean;
  };
  readiness: {
    status: "ready" | "caution" | "not_ready";
    score: number;
    primaryAction: ReadinessAction;
    checks: ReadinessCheck[];
  };
  reviewFocus: {
    review: {
      id: string;
      title: string;
      status: "open" | "completed" | "skipped";
      periodEnd: string;
    } | null;
    overdueCount: number;
    suggestedType: string;
  };
  activeSession: {
    id: string;
    status: string;
    market: string;
    sessionLabel: string;
    emotionalState: string | null;
    mistakeToAvoid: string | null;
    startedAt: string;
    maxDailyLoss: number | null;
  } | null;
  today?: TodayRisk;
  performance?: PerformanceSnapshot;
  recentTrades?: RecentTrade[];
  reviewTasks?: ReviewTasks;
  plans?: PlansOverview;
  /** The week's finding, or null when no pattern repeated; absent in older payloads. */
  focus?: WeekFocus | null;
};

/** The plans and reviews as the tiles read them, from a new payload or from an older one. */
export function plansOf(data: DashboardOverview): PlansOverview {
  if (data.plans) return data.plans;
  const plans = data.plannedTrades ?? [];
  return { todayCount: 0, activeCount: plans.length, completeCount: data.completePlanCount ?? 0, next: plans[0] ?? null };
}

export function reviewTasksOf(data: DashboardOverview): ReviewTasks {
  if (data.reviewTasks) return data.reviewTasks;
  const { review, overdueCount } = data.reviewFocus;
  return { openCount: review ? Math.max(1, overdueCount) : 0, overdueCount, next: review ? { id: review.id, title: review.title, periodEnd: review.periodEnd } : null };
}

/** True for an account with no trade in any status and no active plan: the first-steps card applies. */
export function isNewAccount(data: DashboardOverview): boolean {
  const trades = data.tradeCount ?? (data.metrics?.totalTrades ?? 0) + data.openTrades;
  return trades === 0 && plansOf(data).activeCount === 0;
}
