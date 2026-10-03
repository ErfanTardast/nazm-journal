/**
 * Phase Zeta — story-driven demo. Pure + deterministic: builds a fixed two-week narrative for the
 * conference/demo account — sessions, trades, a repeated early mistake that fades as discipline
 * improves, a weekly review, plus an AI-refusal and a risk-guard example. No DB, no randomness, no
 * Date.now(); the same `startDate` always yields the same story. The demo screen / seed consumes it;
 * it does not write anything itself.
 */
export type DemoTrade = {
  symbol: string;
  side: "long" | "short";
  rMultiple: number;
  ruleFollowed: "followed" | "broken" | "mixed";
  mistake?: string;
};

export type DemoDay = {
  date: string; // YYYY-MM-DD
  index: number; // 0..13
  sessionStarted: boolean;
  disciplineGrade: string;
  trades: DemoTrade[];
  mistakes: string[];
  note: string;
};

export type DemoStory = {
  startDate: string;
  days: DemoDay[];
  repeatedMistake: string;
  disciplineImproved: boolean;
  aiRefusalExample: { requestType: string; refused: true; reason: string };
  riskGuardExample: { scenario: string; blocked: true; reason: string };
  summary: { totalTrades: number; followedRate: number; firstGrade: string; finalGrade: string };
};

const REPEATED_MISTAKE = "Moved stop after entry";
const GRADES = ["C", "C", "D", "C", "C", "B", "B", "B", "A", "A", "A", "A", "A", "A"]; // 14 days, improving
const SYMBOLS = ["BTCUSDT", "ETHUSDT", "EURUSD", "XAUUSD"];

function addDaysISO(start: string, n: number): string {
  const d = new Date(`${start}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

export function buildDemoStory(startDate = "2026-06-01"): DemoStory {
  const days: DemoDay[] = [];

  for (let i = 0; i < 14; i += 1) {
    const firstWeek = i < 7;
    const tradeCount = firstWeek ? 3 : 2; // overtrading early, calmer later
    const trades: DemoTrade[] = [];
    const mistakes: string[] = [];

    for (let j = 0; j < tradeCount; j += 1) {
      const broke = firstWeek && (i + j) % 2 === 0;
      const rMultiple = round2(firstWeek ? -0.4 + 0.3 * j : 0.5 + 0.2 * j);
      const trade: DemoTrade = {
        symbol: SYMBOLS[(i + j) % SYMBOLS.length],
        side: (i + j) % 3 === 0 ? "short" : "long",
        rMultiple,
        ruleFollowed: broke ? "broken" : firstWeek ? "mixed" : "followed"
      };
      // the repeated early mistake recurs on even first-week days, then disappears
      if (broke && i % 2 === 0) {
        trade.mistake = REPEATED_MISTAKE;
        mistakes.push(REPEATED_MISTAKE);
      }
      trades.push(trade);
    }

    days.push({
      date: addDaysISO(startDate, i),
      index: i,
      sessionStarted: true,
      disciplineGrade: GRADES[i],
      trades,
      mistakes,
      note:
        i === 6
          ? "Week 1 review: the recurring stop-moving habit is costing R."
          : i === 13
            ? "Week 2 review: stops held, rules followed, grade up to A."
            : firstWeek
              ? "Choppy start — discipline is the work."
              : "Process is settling in."
    });
  }

  const allTrades = days.flatMap((d) => d.trades);
  const followed = allTrades.filter((t) => t.ruleFollowed === "followed").length;

  return {
    startDate,
    days,
    repeatedMistake: REPEATED_MISTAKE,
    disciplineImproved: GRADES[13] < GRADES[0], // "A" < "C" lexically -> improved
    aiRefusalExample: {
      requestType: "entry_call_request",
      refused: true,
      reason: "The coach reviews process and plans, not entries — it declined and pointed back to the trade plan."
    },
    riskGuardExample: {
      scenario: "Attempted another trade after the daily loss limit was hit",
      blocked: true,
      reason: "The discipline guard closed the session for the day to protect capital."
    },
    summary: {
      totalTrades: allTrades.length,
      followedRate: allTrades.length ? round2(followed / allTrades.length) : 0,
      firstGrade: GRADES[0],
      finalGrade: GRADES[13]
    }
  };
}
