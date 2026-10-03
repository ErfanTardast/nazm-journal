/**
 * The shapes of the sample workspace: a month of believable forex and gold trading that a new account can load to
 * see the product with data in it. Pure data, no database. Rows refer to each other by `key` (a strategy key, a
 * trade key); the service that writes them gives every row its real id.
 */
export type SampleMistakeKey = "late" | "stop" | "revenge";
export type SampleRuleResult = "followed" | "broken" | "mixed";

export type SampleStrategy = {
  key: string;
  name: string;
  description: string;
  entryRules: string[];
  exitRules: string[];
  invalidationRules: string[];
  riskRules: string[];
  allowedMarkets: "forex"[];
  timeframes: string[];
  allowedSessions: string[];
  checklist: string[];
  commonMistakes: string[];
  idealMarketConditions: string[];
  tags: string[];
  /** The numeric limits the risk desk checks a plan against. */
  riskPerTradePct: number;
  maxDailyLossPct: number;
  maxOpenPositions: number;
  status: "active";
  isActive: true;
};

export type SampleTrade = {
  key: string;
  strategyKey: string;
  symbol: "EURUSD" | "GBPUSD" | "USDJPY" | "XAUUSD";
  market: "forex";
  side: "long" | "short";
  status: "closed";
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  takeProfit: number;
  /** Lots. */
  quantity: number;
  /** Money at risk to the stop, in the sample account's currency. */
  riskAmount: number;
  /** The risk over the sample account's balance, in percent. */
  riskPercent: number;
  /** All three are worked out from the prices (`deriveTradeOutcome`), never typed in. */
  rMultiple: number;
  realizedPnl: number;
  fees: number;
  session: string;
  setupType: string;
  confidenceScore: number;
  outcome: string;
  ruleFollowed: SampleRuleResult;
  /** Which mistake the trade carries, in a form that does not depend on the language. */
  mistakeKey: SampleMistakeKey | null;
  openedAt: Date;
  closedAt: Date;
  preTradeNotes: string;
  postTradeNotes: string;
  lessonsLearned: string;
  journal: {
    emotionalState: string;
    mistakes: string[];
    tags: string[];
    notes: string | null;
    preTradeNotes: string;
    postTradeNotes: string;
    lessonsLearned: string;
    ruleFollowed: SampleRuleResult;
    review: string | null;
  };
};

export type SamplePlan = {
  key: string;
  strategyKey: string;
  market: "forex";
  symbol: string;
  bias: string;
  /** "low-high", prices as they are quoted. */
  entryZone: string;
  stopLoss: number;
  takeProfit: number;
  riskAmount: number;
  riskPercent: number;
  /** What the plan screen saves: the three ticks and the chosen direction. */
  checklist: Record<string, unknown>;
  invalidationRule: string | null;
  relevantNews: string | null;
  notes: string | null;
  status: "planned";
  plannedFor: Date;
};

export type SampleReviewChecklistItem = { key: string; label: string; completed: boolean; note?: string };

export type SampleReview = {
  key: string;
  type: "weekly" | "daily";
  status: "completed" | "open";
  periodStart: Date;
  periodEnd: Date;
  title: string;
  checklist: SampleReviewChecklistItem[];
  metrics: Record<string, unknown>;
  insights: string[];
  risks: string[];
  lessons: string[];
  nextActions: string[];
  linkedTradeKeys: string[];
  linkedStrategyKeys: string[];
  completedAt: Date | null;
};

export type SampleWorkspace = {
  locale: "en" | "fa";
  strategies: SampleStrategy[];
  trades: SampleTrade[];
  plans: SamplePlan[];
  reviews: SampleReview[];
};
