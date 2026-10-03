import { z } from "zod";
import { isSupportedTimeZone } from "@/lib/time/zones";
import { normalizeNumberInput } from "@/lib/validation/number-input";

export const idSchema = z.string().min(5).max(128);
export const marketSchema = z.enum(["crypto", "forex", "stocks"]);
export const sideSchema = z.enum(["long", "short"]);
export const tradeStatusSchema = z.enum(["open", "closed", "planned", "canceled"]);
export const alertTypeSchema = z.enum(["price", "indicator", "risk", "journal_reminder", "daily_review", "weekly_review"]);
export const alertStatusSchema = z.enum(["active", "triggered", "paused", "archived"]);
export const notificationChannelSchema = z.enum(["in_app", "email", "telegram", "discord", "webhook"]);
/** The language a screen is showing, sent with requests whose server-generated text should follow it. */
export const generatedTextLocaleSchema = z.enum(["en", "fa"]);
export const reviewTypeSchema = z.enum(["daily", "weekly", "mistake", "risk", "strategy"]);
export const reviewStatusSchema = z.enum(["open", "completed", "skipped"]);
export const ideaTypeSchema = z.enum([
  "market_observation",
  "setup_idea",
  "strategy_improvement",
  "risk_rule_idea",
  "lesson_learned",
  "backtest_idea",
  "news_context_note"
]);
export const ideaStatusSchema = z.enum(["draft", "watching", "tested", "converted_to_plan", "archived"]);

export const reviewChecklistItemSchema = z
  .object({
    key: z.string().min(1).max(80),
    label: z.string().min(2).max(240),
    completed: z.boolean().default(false),
    note: z.string().max(1000).optional()
  })
  .strict();

/** Typed numbers may use Persian/Arabic-Indic digits, "٫" as the decimal mark and thousands separators. */
const numeric = <T extends z.ZodType>(schema: T) => z.preprocess(normalizeNumberInput, schema);
const positiveMoney = numeric(z.coerce.number().finite().positive());
const nonNegativeMoney = numeric(z.coerce.number().finite().nonnegative());
const positiveMoneyMax = (max: number) => numeric(z.coerce.number().finite().positive().max(max));
const nonNegativeMoneyMax = (max: number) => numeric(z.coerce.number().finite().nonnegative().max(max));
const optionalPositiveMoney = positiveMoney.optional().nullable();

export const watchlistCreateSchema = z
  .object({
    name: z.string().min(2).max(80),
    items: z
      .array(
        z.object({
          symbol: z.string().min(1).max(24).transform((value) => value.toUpperCase()),
          market: marketSchema,
          notes: z.string().max(500).optional()
        })
      )
      .default([])
  })
  .strict();

export const watchlistUpdateSchema = z
  .object({
    id: idSchema,
    name: z.string().min(2).max(80).optional(),
    items: z
      .array(
        z.object({
          symbol: z.string().min(1).max(24).transform((value) => value.toUpperCase()),
          market: marketSchema,
          notes: z.string().max(500).optional()
        })
      )
      .optional()
  })
  .strict();

export const idBodySchema = z.object({ id: idSchema }).strict();

const ruleFollowedSchema = z.enum(["followed", "broken", "mixed", "unknown"]);

// Create-time defaults live on tradeCreateSchema only: Zod fills defaults inside .partial() too, so an edit
// built from them would reopen a closed trade and zero its fees whenever those keys were not sent. The
// journal object has none for the same reason; createTrade fills its empty lists and rule verdict.
const tradeFields = {
  portfolioId: idSchema.optional().nullable(),
  strategyId: idSchema.optional().nullable(),
  symbol: z.string().min(1).max(24).transform((value) => value.toUpperCase()),
  ladderKey: z.string().trim().min(1).max(160).optional().nullable(),
  ladderLeg: numeric(z.coerce.number().int().min(1).max(100)).optional().nullable(),
  /** Legs the entry was split into, when an EA numbers them ("k/N"). */
  ladderSize: numeric(z.coerce.number().int().min(2).max(100)).optional().nullable(),
  /** The source's own id for an imported position (e.g. "mt5:<account>:<position>"); set by imports only. */
  externalId: z.string().trim().min(1).max(80).optional().nullable(),
  market: marketSchema,
  side: sideSchema,
  status: tradeStatusSchema,
  entryPrice: positiveMoney,
  exitPrice: optionalPositiveMoney,
  stopLoss: optionalPositiveMoney,
  takeProfit: optionalPositiveMoney,
  quantity: positiveMoney,
  riskAmount: nonNegativeMoney.optional().nullable(),
  riskPercent: nonNegativeMoneyMax(100).optional().nullable(),
  rMultiple: numeric(z.coerce.number().finite()).optional().nullable(),
  realizedPnl: numeric(z.coerce.number().finite()).optional().nullable(),
  fees: nonNegativeMoney,
  session: z.string().max(80).optional().nullable(),
  setupType: z.string().max(120).optional().nullable(),
  confidenceScore: numeric(z.coerce.number().int().min(1).max(10)).optional().nullable(),
  preTradeNotes: z.string().max(4000).optional().nullable(),
  postTradeNotes: z.string().max(4000).optional().nullable(),
  lessonsLearned: z.string().max(4000).optional().nullable(),
  ruleFollowed: ruleFollowedSchema,
  outcome: z.string().max(80).optional().nullable(),
  openedAt: z.coerce.date(),
  closedAt: z.coerce.date().optional().nullable(),
  journal: z
    .object({
      emotionalState: z.string().max(80).optional().nullable(),
      mistakes: z.array(z.string().min(1).max(80)).optional(),
      tags: z.array(z.string().min(1).max(50)).optional(),
      notes: z.string().max(4000).optional().nullable(),
      preTradeNotes: z.string().max(4000).optional().nullable(),
      postTradeNotes: z.string().max(4000).optional().nullable(),
      lessonsLearned: z.string().max(4000).optional().nullable(),
      ruleFollowed: ruleFollowedSchema.optional(),
      review: z.string().max(4000).optional().nullable(),
      screenshotUrl: z.string().url().max(1_500_000).optional().nullable()
    })
    .optional()
};

export const tradeCreateSchema = z
  .object({
    ...tradeFields,
    status: tradeFields.status.default("open"),
    fees: tradeFields.fees.default(0),
    ruleFollowed: tradeFields.ruleFollowed.default("unknown")
  })
  .strict();

export const tradeUpdateSchema = z.object(tradeFields).omit({ externalId: true }).partial().extend({ id: idSchema }).strict();

export const csvImportSchema = z
  .object({
    csv: z.string().min(1).max(500_000),
    filename: z.string().max(255).optional(),
    /** Zone for zone-less open/close times (an MT5 report's broker server time); absent = parsed as before. */
    timeZone: z.string().max(64).refine(isSupportedTimeZone, "Unknown time zone").optional(),
    previewOnly: z.boolean().default(false),
    mapping: z
      .record(z.string(), z.string())
      .default({
        symbol: "symbol",
        market: "market",
        side: "side",
        entryPrice: "entryPrice",
        exitPrice: "exitPrice",
        stopLoss: "stopLoss",
        takeProfit: "takeProfit",
        quantity: "quantity",
        fees: "fees",
        openedAt: "openedAt",
        closedAt: "closedAt"
      })
  })
  .strict();

/** A stop on the entry price leaves no risk distance to size or measure against. */
const stopDiffersFromEntry = {
  message: "Stop loss must be different from the entry price",
  path: ["stopLoss"]
};

export const positionSizeSchema = z
  .object({
    accountBalance: positiveMoney,
    riskPercent: positiveMoneyMax(100),
    entryPrice: positiveMoney,
    stopLoss: positiveMoney,
    feeBuffer: nonNegativeMoney.optional()
  })
  .strict()
  .refine((value) => value.stopLoss !== value.entryPrice, stopDiffersFromEntry);

export const forexLotSchema = z
  .object({
    accountBalance: positiveMoney,
    riskPercent: positiveMoneyMax(100),
    stopLossPips: positiveMoney,
    pipValuePerStandardLot: positiveMoney.optional()
  })
  .strict();

export const liquidationSchema = z
  .object({
    side: sideSchema,
    entryPrice: positiveMoney,
    leverage: positiveMoneyMax(500),
    maintenanceMarginPercent: positiveMoneyMax(100).optional()
  })
  .strict();

export const riskCalculatorSchema = z
  .object({
    positionSize: positionSizeSchema.optional(),
    forexLotSize: forexLotSchema.optional(),
    liquidation: liquidationSchema.optional(),
    rewardRisk: z
      .object({
        entryPrice: positiveMoney,
        stopLoss: positiveMoney,
        takeProfit: positiveMoney
      })
      .refine((value) => value.stopLoss !== value.entryPrice, stopDiffersFromEntry)
      .optional(),
    stopLossDistance: z
      .object({
        entryPrice: positiveMoney,
        stopLoss: positiveMoney
      })
      .optional()
  })
  .strict();

// The same rule as tradeFields above, for every schema below that has an update twin: the shared fields carry no
// defaults, the create schema adds them, and the update schema is the bare fields made optional. Otherwise an edit
// that leaves a field out would write its create-time default (renaming a portfolio set its cash to 0).
const portfolioFields = {
  name: z.string().min(2).max(80),
  baseCurrency: z.string().min(3).max(6),
  cashBalance: nonNegativeMoney
};

export const portfolioCreateSchema = z
  .object({
    ...portfolioFields,
    baseCurrency: portfolioFields.baseCurrency.default("USD"),
    cashBalance: portfolioFields.cashBalance.default(0)
  })
  .strict();

export const portfolioUpdateSchema = z.object(portfolioFields).partial().extend({ id: idSchema }).strict();

export const portfolioTransactionSchema = z
  .object({
    symbol: z.string().min(1).max(24).transform((value) => value.toUpperCase()),
    market: marketSchema,
    side: sideSchema,
    quantity: positiveMoney,
    price: positiveMoney,
    fees: nonNegativeMoney.default(0),
    executedAt: z.coerce.date(),
    notes: z.string().max(1000).optional().nullable()
  })
  .strict();

const strategyFields = {
  name: z.string().min(2).max(120),
  description: z.string().max(2000).optional().nullable(),
  entryRules: z.array(z.string().min(1).max(500)).min(1),
  exitRules: z.array(z.string().min(1).max(500)).min(1),
  invalidationRules: z.array(z.string().min(1).max(500)),
  riskRules: z.array(z.string().min(1).max(500)),
  allowedMarkets: z.array(marketSchema).min(1),
  timeframes: z.array(z.string().min(1).max(40)),
  allowedSessions: z.array(z.string().min(1).max(80)),
  checklist: z.array(z.string().min(1).max(200)),
  commonMistakes: z.array(z.string().min(1).max(200)),
  idealMarketConditions: z.array(z.string().min(1).max(200)),
  tags: z.array(z.string().min(1).max(60)),
  // Optional numeric limits a plan made from the strategy is checked against (see calculations/plan-risk-check).
  riskPerTradePct: positiveMoneyMax(100).optional().nullable(),
  maxDailyLossPct: positiveMoneyMax(100).optional().nullable(),
  maxOpenPositions: numeric(z.coerce.number().int().min(1).max(100)).optional().nullable(),
  status: z.string().min(2).max(40),
  isActive: z.boolean()
};

export const strategyCreateSchema = z
  .object({
    ...strategyFields,
    invalidationRules: strategyFields.invalidationRules.default([]),
    riskRules: strategyFields.riskRules.default([]),
    timeframes: strategyFields.timeframes.default([]),
    allowedSessions: strategyFields.allowedSessions.default([]),
    checklist: strategyFields.checklist.default([]),
    commonMistakes: strategyFields.commonMistakes.default([]),
    idealMarketConditions: strategyFields.idealMarketConditions.default([]),
    tags: strategyFields.tags.default([]),
    status: strategyFields.status.default("active"),
    isActive: strategyFields.isActive.default(true)
  })
  .strict();

export const strategyUpdateSchema = z.object(strategyFields).partial().extend({ id: idSchema }).strict();

export const backtestCreateSchema = z
  .object({
    strategyId: idSchema.optional().nullable(),
    name: z.string().min(2).max(120),
    market: marketSchema,
    timeframe: z.string().min(1).max(24),
    startingBalance: positiveMoney,
    trades: z
      .array(
        z.object({
          entryPrice: positiveMoney,
          exitPrice: positiveMoney,
          quantity: positiveMoney,
          side: sideSchema,
          fees: nonNegativeMoney.default(0)
        })
      )
      .default([])
  })
  .strict();

const alertFields = {
  type: alertTypeSchema,
  status: alertStatusSchema,
  symbol: z.string().min(1).max(24).transform((value) => value.toUpperCase()).optional().nullable(),
  condition: z.record(z.string(), z.unknown()),
  message: z.string().min(2).max(500),
  channels: z.array(notificationChannelSchema)
};

export const alertCreateSchema = z
  .object({
    ...alertFields,
    status: alertFields.status.default("active"),
    channels: alertFields.channels.default(["in_app"])
  })
  .strict();

export const alertUpdateSchema = z.object(alertFields).partial().extend({ id: idSchema }).strict();

export const aiReviewTradeSchema = z
  .object({
    symbol: z.string().min(1).max(24),
    side: sideSchema,
    entryPrice: positiveMoney,
    exitPrice: positiveMoney.optional().nullable(),
    stopLoss: positiveMoney.optional().nullable(),
    takeProfit: positiveMoney.optional().nullable(),
    notes: z.string().max(4000).optional(),
    mode: z.enum(["professional_coach", "learning"]).default("professional_coach"),
    locale: generatedTextLocaleSchema.optional()
  })
  .strict();

/**
 * What the risk desk worked out for a plan and saves into it (`TradePlan.sizing`): the numbers it used and the
 * volume split into legs. The desk computes these, so they are plain numbers: nothing typed, nothing coerced.
 * `symbol` is the desk's symbol preset (or "custom"); `direction` is the desk's own buy/sell.
 */
const sizingPositive = z.number().finite().positive();
const sizingNonNegative = z.number().finite().nonnegative();
export const planSizingSchema = z
  .object({
    symbol: z.string().min(1).max(24),
    direction: z.enum(["buy", "sell"]),
    balance: sizingPositive,
    riskPercent: sizingPositive.max(100),
    entry: sizingPositive,
    stopLoss: sizingPositive,
    finalTp: sizingPositive,
    totalVolume: sizingPositive,
    /** The risk budget: balance x risk %. */
    riskMoney: sizingNonNegative,
    /** The loss at the stop for the volume the lot rules allow (at most the budget). */
    lossAtStop: sizingNonNegative,
    finalRr: sizingNonNegative,
    legs: z
      .array(z.object({ volume: sizingPositive, takeProfit: sizingPositive, rr: sizingNonNegative }).strict())
      .min(1)
      .max(20),
    sizedAt: z.iso.datetime()
  })
  .strict();
export type PlanSizing = z.infer<typeof planSizingSchema>;

// Same rule as tradeFields above: create-time defaults (the checklist and the "planned" status) live on
// tradePlanCreateSchema only. Zod 4 keeps `.default()` inside `.partial()`, so an update built from the create schema
// parsed a PATCH that only sent `checklist` as `status: "planned"` and overwrote the plan's stored status. Both
// schemas are built from these fields, so every rule still applies to whatever an update does send.
const tradePlanFields = {
  strategyId: idSchema.optional().nullable(),
  market: marketSchema,
  symbol: z.string().min(1).max(24).transform((value) => value.toUpperCase()),
  bias: z.string().min(2).max(500),
  entryZone: z.string().min(1).max(120),
  stopLoss: positiveMoney.optional().nullable(),
  takeProfit: positiveMoney.optional().nullable(),
  riskAmount: nonNegativeMoney.optional().nullable(),
  riskPercent: nonNegativeMoneyMax(100).optional().nullable(),
  checklist: z.record(z.string(), z.unknown()),
  invalidationRule: z.string().max(1000).optional().nullable(),
  relevantNews: z.string().max(1000).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  status: z.enum(["planned", "active", "closed", "canceled"]),
  plannedFor: z.coerce.date().optional().nullable(),
  sizing: planSizingSchema.optional().nullable()
};

export const tradePlanCreateSchema = z
  .object({
    ...tradePlanFields,
    checklist: tradePlanFields.checklist.default({}),
    status: tradePlanFields.status.default("planned")
  })
  .strict();

// `expectedStatus` is not a field of the plan: it is the status the sender last saw. With it the update is applied only
// while the plan still has that status, so a screen that loaded the plan earlier cannot change one that was converted,
// closed, canceled or activated since.
export const tradePlanUpdateSchema = z
  .object(tradePlanFields)
  .partial()
  .extend({ id: idSchema, expectedStatus: tradePlanFields.status.optional() })
  .strict();

export const tradePlanConvertSchema = z
  .object({
    entryPrice: positiveMoney,
    exitPrice: positiveMoney.optional().nullable(),
    quantity: positiveMoney,
    fees: nonNegativeMoney.default(0),
    openedAt: z.coerce.date().optional(),
    closedAt: z.coerce.date().optional().nullable(),
    outcome: z.string().max(80).optional().nullable(),
    postTradeNotes: z.string().max(4000).optional().nullable()
  })
  .strict();

export const newsAnalyzeSchema = z
  .object({
    newsItemId: idSchema.optional(),
    text: z.string().min(10).max(10_000).optional(),
    language: z.enum(["en", "fa"]).default("en"),
    market: marketSchema.optional(),
    plannedTradeId: idSchema.optional(),
    mode: z.enum(["professional_coach", "learning"]).default("professional_coach")
  })
  .strict()
  .refine((value) => value.newsItemId || value.text, {
    message: "newsItemId or text is required"
  });

export const aiModeSchema = z
  .object({
    mode: z.enum(["professional_coach", "learning"]).default("professional_coach"),
    locale: generatedTextLocaleSchema.optional()
  })
  .strict();

export const reviewGenerateSchema = z
  .object({
    type: reviewTypeSchema,
    periodStart: z.coerce.date().optional(),
    periodEnd: z.coerce.date().optional(),
    createReminder: z.boolean().default(false),
    locale: generatedTextLocaleSchema.optional()
  })
  .strict();

/** The body of a request that only needs to say which language the generated text should be in. */
export const generatedTextLocaleBodySchema = z.object({ locale: generatedTextLocaleSchema.optional() }).strict();

export const reviewCreateSchema = z
  .object({
    type: reviewTypeSchema,
    title: z.string().min(2).max(160),
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
    checklist: z.array(reviewChecklistItemSchema).default([]),
    metrics: z.record(z.string(), z.unknown()).optional().nullable(),
    insights: z.array(z.string().min(1).max(500)).default([]),
    risks: z.array(z.string().min(1).max(500)).default([]),
    lessons: z.array(z.string().min(1).max(500)).default([]),
    nextActions: z.array(z.string().min(1).max(500)).default([]),
    linkedTradeIds: z.array(idSchema).default([]),
    linkedStrategyIds: z.array(idSchema).default([]),
    locale: generatedTextLocaleSchema.optional()
  })
  .strict()
  .refine((value) => value.periodEnd >= value.periodStart, {
    message: "periodEnd must be after periodStart",
    path: ["periodEnd"]
  });

export const reviewUpdateSchema = z
  .object({
    id: idSchema,
    status: reviewStatusSchema.optional(),
    checklist: z.array(reviewChecklistItemSchema).optional(),
    lessons: z.array(z.string().min(1).max(500)).optional(),
    nextActions: z.array(z.string().min(1).max(500)).optional(),
    completedAt: z.coerce.date().optional().nullable(),
    carryForward: z.boolean().default(false),
    locale: generatedTextLocaleSchema.optional()
  })
  .strict();

const ideaFields = {
  title: z.string().min(2).max(160),
  market: marketSchema,
  symbols: z.array(z.string().min(1).max(24).transform((value) => value.toUpperCase())),
  type: ideaTypeSchema,
  status: ideaStatusSchema,
  thesis: z.string().min(5).max(4000),
  invalidation: z.string().max(2000).optional().nullable(),
  relatedStrategyId: idSchema.optional().nullable(),
  relatedWatchlistSymbol: z.string().min(1).max(24).transform((value) => value.toUpperCase()).optional().nullable(),
  relatedNewsContext: z.string().max(2000).optional().nullable(),
  confidence: numeric(z.coerce.number().int().min(1).max(10)),
  tags: z.array(z.string().min(1).max(60))
};

export const ideaCreateSchema = z
  .object({
    ...ideaFields,
    symbols: ideaFields.symbols.default([]),
    status: ideaFields.status.default("draft"),
    confidence: ideaFields.confidence.default(5),
    tags: ideaFields.tags.default([])
  })
  .strict();

export const ideaUpdateSchema = z.object(ideaFields).partial().extend({ id: idSchema }).strict();

export const sessionCreateSchema = z
  .object({
    market: marketSchema,
    sessionLabel: z.string().min(1).max(80),
    emotionalState: z.string().max(200).optional().nullable(),
    maxDailyLoss: numeric(z.coerce.number().positive().max(100)).optional().nullable(),
    allowedStrategyIds: z.array(idSchema).default([]),
    mistakeToAvoid: z.string().max(500).optional().nullable(),
    notes: z.string().max(2000).optional().nullable()
  })
  .strict();

export const sessionEndSchema = z
  .object({
    status: z.enum(["completed", "abandoned"]),
    notes: z.string().max(2000).optional().nullable()
  })
  .strict();
