import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { databaseUnavailableMessage, isDatabaseUnavailableError } from "@/lib/db/errors";
import { demoSeedAllowed } from "@/lib/demo";
import { renameFormerDemoAccount } from "@/lib/services/demo-account";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  if (!demoSeedAllowed({ NODE_ENV: process.env.NODE_ENV, NEXT_PUBLIC_DEMO_MODE: process.env.NEXT_PUBLIC_DEMO_MODE, DEMO_SEED: process.env.DEMO_SEED })) {
    // Production code does not depend on seeded rows (register upserts its own role), so skipping is safe.
    console.log("Demo mode is off (a production image not built as a demo): skipping the demo seed.");
    return;
  }

  const passwordHash = await bcrypt.hash("DemoPassword123!", 12);

  const permissions = await Promise.all(
    [
      ["dashboard:read", "Read dashboard overview"],
      ["trades:write", "Create and update trades"],
      ["portfolio:write", "Manage portfolios"],
      ["alerts:write", "Manage alerts"],
      ["admin:read", "Read admin overview"]
    ].map(([key, description]) =>
      prisma.permission.upsert({
        where: { key },
        update: { description },
        create: { key, description }
      })
    )
  );

  const adminRole = await prisma.role.upsert({
    where: { name: "admin" },
    update: {
      description: "Full administrative role"
    },
    create: {
      name: "admin",
      description: "Full administrative role"
    }
  });

  await Promise.all(
    permissions.map((permission) =>
      prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: adminRole.id,
            permissionId: permission.id
          }
        },
        update: {},
        create: {
          roleId: adminRole.id,
          permissionId: permission.id
        }
      })
    )
  );

  // A database seeded before the rename holds the demo account under its former login: rename it in place first, so
  // the upsert below finds it and the trades and journal it owns stay with the login the sign-in page shows.
  await renameFormerDemoAccount(prisma);

  const demoUser = await prisma.user.upsert({
    where: { email: "demo@nazm.example" },
    update: {
      passwordHash,
      name: "Demo Trader",
      locale: "en",
      timezone: "Asia/Tehran",
      theme: "dark"
    },
    create: {
      email: "demo@nazm.example",
      name: "Demo Trader",
      passwordHash,
      locale: "en",
      timezone: "Asia/Tehran",
      theme: "dark",
      roles: {
        create: {
          roleId: adminRole.id
        }
      },
      riskProfile: {
        create: {
          accountSize: "25000",
          riskPerTradePct: "1",
          maxDailyRiskPct: "3",
          maxWeeklyRiskPct: "6",
          maxOpenRiskPct: "5",
          rules: {
            maxTradesPerDay: 3,
            requireChecklistBeforeEntry: true,
            avoidTradingDuringHighImpactNews: true
          }
        }
      }
    }
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: demoUser.id,
        roleId: adminRole.id
      }
    },
    update: {},
    create: {
      userId: demoUser.id,
      roleId: adminRole.id
    }
  });

  const btc = await prisma.asset.upsert({
    where: { symbol_market: { symbol: "BTCUSDT", market: "crypto" } },
    update: {},
    create: {
      symbol: "BTCUSDT",
      name: "Bitcoin / Tether",
      market: "crypto",
      baseAsset: "BTC",
      quoteAsset: "USDT"
    }
  });

  const eurusd = await prisma.asset.upsert({
    where: { symbol_market: { symbol: "EURUSD", market: "forex" } },
    update: {},
    create: {
      symbol: "EURUSD",
      name: "Euro / US Dollar",
      market: "forex",
      baseAsset: "EUR",
      quoteAsset: "USD"
    }
  });

  const aapl = await prisma.asset.upsert({
    where: { symbol_market: { symbol: "AAPL", market: "stocks" } },
    update: {},
    create: {
      symbol: "AAPL",
      name: "Apple Inc.",
      market: "stocks",
      baseAsset: "AAPL",
      quoteAsset: "USD"
    }
  });

  const watchlist = await prisma.watchlist.upsert({
    where: {
      id: "seed_watchlist_main"
    },
    update: {
      userId: demoUser.id,
      name: "Main Watchlist"
    },
    create: {
      id: "seed_watchlist_main",
      userId: demoUser.id,
      name: "Main Watchlist"
    }
  });

  await prisma.watchlistItem.upsert({
    where: {
      watchlistId_symbol_market: {
        watchlistId: watchlist.id,
        symbol: btc.symbol,
        market: "crypto"
      }
    },
    update: {},
    create: {
      watchlistId: watchlist.id,
      assetId: btc.id,
      symbol: btc.symbol,
      market: "crypto",
      notes: "High-liquidity crypto benchmark"
    }
  });

  await prisma.watchlistItem.upsert({
    where: {
      watchlistId_symbol_market: {
        watchlistId: watchlist.id,
        symbol: aapl.symbol,
        market: "stocks"
      }
    },
    update: {},
    create: {
      watchlistId: watchlist.id,
      assetId: aapl.id,
      symbol: aapl.symbol,
      market: "stocks",
      notes: "Global stock watch item for earnings-context review"
    }
  });

  await prisma.watchlistItem.upsert({
    where: {
      watchlistId_symbol_market: {
        watchlistId: watchlist.id,
        symbol: eurusd.symbol,
        market: "forex"
      }
    },
    update: {},
    create: {
      watchlistId: watchlist.id,
      assetId: eurusd.id,
      symbol: eurusd.symbol,
      market: "forex",
      notes: "London/New York session focus"
    }
  });

  const portfolio = await prisma.portfolio.upsert({
    where: { id: "seed_portfolio_main" },
    update: {
      userId: demoUser.id,
      name: "Demo Trading Account",
      baseCurrency: "USD",
      cashBalance: "25000"
    },
    create: {
      id: "seed_portfolio_main",
      userId: demoUser.id,
      name: "Demo Trading Account",
      baseCurrency: "USD",
      cashBalance: "25000"
    }
  });

  await prisma.portfolioTransaction.create({
    data: {
      portfolioId: portfolio.id,
      assetId: btc.id,
      side: "long",
      quantity: "0.15",
      price: "62000",
      fees: "12",
      executedAt: new Date("2026-06-02T10:00:00.000Z"),
      notes: "Seed BTC accumulation"
    }
  });

  await prisma.portfolioHolding.upsert({
    where: {
      portfolioId_assetId: {
        portfolioId: portfolio.id,
        assetId: btc.id
      }
    },
    update: {
      quantity: "0.15",
      averageEntry: "62000",
      realizedPnl: "0"
    },
    create: {
      portfolioId: portfolio.id,
      assetId: btc.id,
      quantity: "0.15",
      averageEntry: "62000",
      realizedPnl: "0"
    }
  });

  const strategy = await prisma.strategy.upsert({
    where: { id: "seed_strategy_breakout" },
    update: {
      userId: demoUser.id,
      name: "Session Breakout",
      description: "London/New York liquidity breakout with fixed risk.",
      entryRules: ["Break previous session high", "Confirm volume expansion"],
      exitRules: ["Partial at 1R", "Trail below structure"],
      invalidationRules: ["No follow-through in three candles"],
      riskRules: ["Max 1% account risk"],
      allowedMarkets: ["crypto", "forex"],
      timeframes: ["1h", "4h"],
      allowedSessions: ["London", "New York"],
      checklist: ["Mark session range", "Check news", "Confirm risk size"],
      commonMistakes: ["Entering before confirmation", "Ignoring news window"],
      idealMarketConditions: ["Clear liquidity range", "No immediate high-impact event"],
      tags: ["breakout", "discipline"]
    },
    create: {
      id: "seed_strategy_breakout",
      userId: demoUser.id,
      name: "Session Breakout",
      description: "London/New York liquidity breakout with fixed risk.",
      entryRules: ["Break previous session high", "Confirm volume expansion"],
      exitRules: ["Partial at 1R", "Trail below structure"],
      invalidationRules: ["No follow-through in three candles"],
      riskRules: ["Max 1% account risk"],
      allowedMarkets: ["crypto", "forex"],
      timeframes: ["1h", "4h"],
      allowedSessions: ["London", "New York"],
      checklist: ["Mark session range", "Check news", "Confirm risk size"],
      commonMistakes: ["Entering before confirmation", "Ignoring news window"],
      idealMarketConditions: ["Clear liquidity range", "No immediate high-impact event"],
      tags: ["breakout", "discipline"]
    }
  });

  const winningTrade = await prisma.trade.upsert({
    where: { id: "seed_trade_btc_win" },
    update: {},
    create: {
      id: "seed_trade_btc_win",
      userId: demoUser.id,
      portfolioId: portfolio.id,
      assetId: btc.id,
      strategyId: strategy.id,
      symbol: "BTCUSDT",
      market: "crypto",
      side: "long",
      status: "closed",
      entryPrice: "62000",
      exitPrice: "64600",
      stopLoss: "61000",
      takeProfit: "65000",
      quantity: "0.1",
      riskAmount: "100",
      riskPercent: "0.4",
      rMultiple: "2.6",
      realizedPnl: "244",
      fees: "16",
      session: "London/New York overlap",
      setupType: "Breakout retest",
      confidenceScore: 8,
      preTradeNotes: "Trade matches session breakout checklist.",
      postTradeNotes: "Partial plan executed well.",
      lessonsLearned: "Wait for retest improved entry quality.",
      ruleFollowed: "followed",
      outcome: "win",
      openedAt: new Date("2026-06-03T08:00:00.000Z"),
      closedAt: new Date("2026-06-03T14:00:00.000Z")
    }
  });

  await prisma.tradeJournalEntry.upsert({
    where: { tradeId: winningTrade.id },
    update: {},
    create: {
      userId: demoUser.id,
      tradeId: winningTrade.id,
      emotionalState: "Focused",
      mistakes: [],
      tags: ["breakout", "a-setup"],
      notes: "Waited for retest and sized according to plan.",
      review: "Good execution and clean invalidation."
    }
  });

  const losingTrade = await prisma.trade.upsert({
    where: { id: "seed_trade_eurusd_loss" },
    update: {},
    create: {
      id: "seed_trade_eurusd_loss",
      userId: demoUser.id,
      portfolioId: portfolio.id,
      assetId: eurusd.id,
      strategyId: strategy.id,
      symbol: "EURUSD",
      market: "forex",
      side: "short",
      status: "closed",
      entryPrice: "1.0820",
      exitPrice: "1.0860",
      stopLoss: "1.0860",
      takeProfit: "1.0740",
      quantity: "100000",
      riskAmount: "400",
      riskPercent: "1.6",
      rMultiple: "-1",
      realizedPnl: "-407",
      fees: "7",
      session: "London",
      setupType: "News fade",
      confidenceScore: 4,
      preTradeNotes: "Bias was not fully confirmed.",
      postTradeNotes: "News timing invalidated the setup.",
      lessonsLearned: "Do not trade inside high-impact news window.",
      ruleFollowed: "broken",
      outcome: "loss",
      openedAt: new Date("2026-06-04T09:30:00.000Z"),
      closedAt: new Date("2026-06-04T11:20:00.000Z")
    }
  });

  await prisma.tradeJournalEntry.upsert({
    where: { tradeId: losingTrade.id },
    update: {},
    create: {
      userId: demoUser.id,
      tradeId: losingTrade.id,
      emotionalState: "Impatient",
      mistakes: ["entered-before-confirmation"],
      tags: ["forex", "news-risk"],
      notes: "Entered before full confirmation near news window.",
      review: "Respect news filter and wait for confirmation candle."
    }
  });

  const stockTrade = await prisma.trade.upsert({
    where: { id: "seed_trade_aapl_review" },
    update: {},
    create: {
      id: "seed_trade_aapl_review",
      userId: demoUser.id,
      portfolioId: portfolio.id,
      assetId: aapl.id,
      strategyId: strategy.id,
      symbol: "AAPL",
      market: "stocks",
      side: "long",
      status: "closed",
      entryPrice: "192",
      exitPrice: "197.5",
      stopLoss: "189",
      takeProfit: "201",
      quantity: "25",
      riskAmount: "75",
      riskPercent: "0.3",
      rMultiple: "1.83",
      realizedPnl: "131.5",
      fees: "6",
      session: "US cash open",
      setupType: "Earnings drift pullback",
      confidenceScore: 7,
      preTradeNotes: "Reviewed earnings context and waited for pullback confirmation.",
      postTradeNotes: "Exit followed pre-written review level.",
      lessonsLearned: "Context notes helped avoid chasing the open.",
      ruleFollowed: "followed",
      outcome: "win",
      openedAt: new Date("2026-06-05T14:35:00.000Z"),
      closedAt: new Date("2026-06-05T18:10:00.000Z")
    }
  });

  await prisma.tradeJournalEntry.upsert({
    where: { tradeId: stockTrade.id },
    update: {},
    create: {
      userId: demoUser.id,
      tradeId: stockTrade.id,
      emotionalState: "Patient",
      mistakes: [],
      tags: ["stocks", "earnings-context"],
      notes: "Used context note as a review anchor and avoided opening volatility.",
      lessonsLearned: "A written observation before the session reduced impulsive entry."
    }
  });

  await prisma.backtest.upsert({
    where: { id: "seed_backtest_breakout" },
    update: {},
    create: {
      id: "seed_backtest_breakout",
      userId: demoUser.id,
      strategyId: strategy.id,
      name: "Session Breakout Q2 Sample",
      market: "crypto",
      timeframe: "1h",
      startingBalance: "25000",
      result: {
        totalTrades: 12,
        winRate: 0.58,
        profitFactor: 1.7,
        maxDrawdown: 0.045,
        expectancy: 118.5
      },
      trades: [],
      equityCurve: [
        { date: "2026-04-01", equity: 25000 },
        { date: "2026-05-01", equity: 25820 },
        { date: "2026-06-01", equity: 26422 }
      ]
    }
  });

  await prisma.alert.upsert({
    where: { id: "seed_alert_btc" },
    update: {
      userId: demoUser.id,
      status: "active"
    },
    create: {
      id: "seed_alert_btc",
      userId: demoUser.id,
      type: "price",
      status: "active",
      symbol: "BTCUSDT",
      condition: { operator: ">=", price: 65000 },
      message: "BTCUSDT reached breakout review level.",
      channels: ["in_app"]
    }
  });

  await prisma.tradePlan.upsert({
    where: { id: "seed_plan_btc_review" },
    update: {
      userId: demoUser.id,
      strategyId: strategy.id,
      status: "planned"
    },
    create: {
      id: "seed_plan_btc_review",
      userId: demoUser.id,
      strategyId: strategy.id,
      market: "crypto",
      symbol: "BTCUSDT",
      bias: "Bullish only if price reclaims the prior session high",
      entryZone: "64600-65100",
      stopLoss: "63750",
      takeProfit: "67000",
      riskAmount: "125",
      riskPercent: "0.5",
      checklist: {
        newsChecked: true,
        riskCalculated: true,
        strategyMatched: true
      },
      invalidationRule: "Close below session midpoint invalidates the plan.",
      relevantNews: "Monitor crypto regulation and ETF flow headlines.",
      notes: "Planning only. No execution instruction.",
      status: "planned",
      plannedFor: new Date("2026-06-10T13:00:00.000Z")
    }
  });

  await prisma.idea.upsert({
    where: { id: "seed_idea_btc_liquidity" },
    update: {
      userId: demoUser.id,
      status: "watching"
    },
    create: {
      id: "seed_idea_btc_liquidity",
      userId: demoUser.id,
      title: "BTC liquidity retest observation",
      market: "crypto",
      symbols: ["BTCUSDT"],
      type: "market_observation",
      status: "watching",
      thesis: "If BTC reclaims the prior session high, review whether the breakout playbook conditions are present.",
      invalidation: "Ignore if price closes below the session midpoint before review.",
      relatedStrategyId: strategy.id,
      relatedWatchlistSymbol: "BTCUSDT",
      relatedNewsContext: "ETF flow headlines may affect volatility; use as context only.",
      confidence: 6,
      tags: ["liquidity", "review"]
    }
  });

  await prisma.idea.upsert({
    where: { id: "seed_idea_risk_guardrail" },
    update: {
      userId: demoUser.id,
      status: "draft"
    },
    create: {
      id: "seed_idea_risk_guardrail",
      userId: demoUser.id,
      title: "News-window risk guardrail",
      market: "forex",
      symbols: ["EURUSD"],
      type: "risk_rule_idea",
      status: "draft",
      thesis: "Add a checklist item that requires reducing risk near high-importance central-bank context.",
      invalidation: "Remove if weekly reviews show no relation between event timing and rule breaks.",
      relatedStrategyId: strategy.id,
      relatedWatchlistSymbol: "EURUSD",
      confidence: 8,
      tags: ["risk", "news-context"]
    }
  });

  await prisma.review.upsert({
    where: { id: "seed_review_daily_focus" },
    update: {
      userId: demoUser.id,
      type: "daily",
      status: "open",
      periodStart: new Date("2026-06-10T00:00:00.000Z"),
      periodEnd: new Date("2026-06-10T23:59:59.999Z"),
      title: "Daily review - 2026-06-10",
      checklist: [
        { key: "review_plans", label: "Review today's planned scenarios and invalidation notes.", completed: true },
        { key: "check_risk_limits", label: "Confirm risk defaults before adding new journal records.", completed: false },
        { key: "journal_recent_trades", label: "Update notes, mistakes, lessons, and rule discipline.", completed: false },
        { key: "review_market_context", label: "Read current market context as background, not as an instruction.", completed: false },
        { key: "write_one_lesson", label: "Write one process lesson for the next review.", completed: false }
      ],
      metrics: {
        periodTrades: 2,
        openTrades: 0,
        plannedTrades: 1,
        ruleBreaks: 1,
        topMistakes: ["entered-before-confirmation"]
      },
      insights: ["Two seeded journal records are available for review.", "One planned BTCUSDT scenario is ready for checklist review."],
      risks: ["One record shows broken rules. Review causes before adding new plans."],
      lessons: [],
      nextActions: ["Write one prevention rule for entered-before-confirmation.", "Confirm risk defaults before adding new journal records."],
      linkedTradeIds: [winningTrade.id, losingTrade.id, stockTrade.id],
      linkedStrategyIds: [strategy.id]
    },
    create: {
      id: "seed_review_daily_focus",
      userId: demoUser.id,
      type: "daily",
      status: "open",
      periodStart: new Date("2026-06-10T00:00:00.000Z"),
      periodEnd: new Date("2026-06-10T23:59:59.999Z"),
      title: "Daily review - 2026-06-10",
      checklist: [
        { key: "review_plans", label: "Review today's planned scenarios and invalidation notes.", completed: true },
        { key: "check_risk_limits", label: "Confirm risk defaults before adding new journal records.", completed: false },
        { key: "journal_recent_trades", label: "Update notes, mistakes, lessons, and rule discipline.", completed: false },
        { key: "review_market_context", label: "Read current market context as background, not as an instruction.", completed: false },
        { key: "write_one_lesson", label: "Write one process lesson for the next review.", completed: false }
      ],
      metrics: {
        periodTrades: 2,
        openTrades: 0,
        plannedTrades: 1,
        ruleBreaks: 1,
        topMistakes: ["entered-before-confirmation"]
      },
      insights: ["Two seeded journal records are available for review.", "One planned BTCUSDT scenario is ready for checklist review."],
      risks: ["One record shows broken rules. Review causes before adding new plans."],
      lessons: [],
      nextActions: ["Write one prevention rule for entered-before-confirmation.", "Confirm risk defaults before adding new journal records."],
      linkedTradeIds: [winningTrade.id, losingTrade.id, stockTrade.id],
      linkedStrategyIds: [strategy.id]
    }
  });

  await prisma.alert.upsert({
    where: { id: "seed_alert_daily_review" },
    update: {
      userId: demoUser.id,
      status: "active",
      condition: {
        reviewId: "seed_review_daily_focus",
        reviewType: "daily",
        dueAt: "2026-06-10T23:59:59.999Z"
      },
      message: "Daily review - 2026-06-10 is ready for review."
    },
    create: {
      id: "seed_alert_daily_review",
      userId: demoUser.id,
      type: "daily_review",
      status: "active",
      condition: {
        reviewId: "seed_review_daily_focus",
        reviewType: "daily",
        dueAt: "2026-06-10T23:59:59.999Z"
      },
      message: "Daily review - 2026-06-10 is ready for review.",
      channels: ["in_app"]
    }
  });

  const newsItem = await prisma.newsItem.upsert({
    where: { id: "seed_news_macro_en" },
    update: {},
    create: {
      id: "seed_news_macro_en",
      title: "Central bank commentary keeps dollar pairs in focus",
      source: "Nazm sample",
      publishedAt: new Date("2026-06-10T08:00:00.000Z"),
      language: "en",
      market: "forex",
      relatedSymbols: ["EURUSD", "GBPUSD"],
      category: "central_bank",
      importance: "high",
      sentiment: "caution",
      summary: "Sample news item: central bank speakers are scheduled this week. Check the calendar before trading major dollar pairs.",
      possibleAffectedAssets: ["EURUSD", "GBPUSD", "DXY"],
      riskNotes: ["Review event calendar", "Avoid oversized risk before speeches"]
    }
  });

  await prisma.newsAnalysis.upsert({
    where: { id: "seed_news_analysis_macro_en" },
    update: {},
    create: {
      id: "seed_news_analysis_macro_en",
      userId: demoUser.id,
      newsItemId: newsItem.id,
      mode: "professional_coach",
      whatHappened: "Central bank commentary may increase short-term volatility in major currency pairs.",
      affectedMarket: "forex",
      impactLevel: "high",
      cautionNotes: ["Confirm session liquidity", "Reduce risk if plan conflicts with event timing"],
      conflicts: { plannedTrades: ["Review EURUSD plans before entry"] },
      reviewChecklist: ["Check calendar", "Review spread/liquidity", "Confirm strategy conditions"]
    }
  });

  await prisma.learningGlossary.upsert({
    where: { term_language: { term: "R Multiple", language: "en" } },
    update: {},
    create: {
      term: "R Multiple",
      language: "en",
      level: "beginner",
      definition: "R multiple compares trade profit or loss against the initial amount risked.",
      example: "A trade risking $100 and making $250 is +2.5R.",
      relatedTerms: ["Risk amount", "Expectancy", "Position size"]
    }
  });

  await prisma.learningGlossary.upsert({
    where: { term_language: { term: "ضریب R", language: "fa" } },
    update: {},
    create: {
      term: "ضریب R",
      language: "fa",
      level: "beginner",
      definition: "ضریب R سود یا زیان معامله را نسبت به مقدار ریسک اولیه مقایسه می‌کند.",
      example: "اگر ۱۰۰ دلار ریسک کنید و ۲۵۰ دلار سود بگیرید، نتیجه معامله +۲.۵R است.",
      relatedTerms: ["ریسک", "امید ریاضی", "حجم معامله"]
    }
  });

  await prisma.appSetting.upsert({
    where: { key: "risk_disclaimer" },
    update: {
      value: {
        text: "Nazm provides analytics and education, not guaranteed financial outcomes."
      }
    },
    create: {
      key: "risk_disclaimer",
      value: {
        text: "Nazm provides analytics and education, not guaranteed financial outcomes."
      }
    }
  });

  console.log("Seed complete. Demo user: demo@nazm.example / DemoPassword123!");
}

main()
  .catch((error) => {
    if (isDatabaseUnavailableError(error)) {
      console.error(databaseUnavailableMessage());
      process.exit(1);
    }
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
