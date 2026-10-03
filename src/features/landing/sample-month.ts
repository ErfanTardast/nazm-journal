/**
 * The illustrative month every chart on the landing page reads: thirty trades, each with its result in R and, where
 * a rule was broken, which one. It is sample data and is labelled as such on the page. The headline numbers are
 * derived here so the hero, the histogram and the copy cannot disagree.
 */
export type MistakeTag = "late" | "stop" | "revenge";

export type SampleTrade = { r: number; mistake?: MistakeTag };

const trades: SampleTrade[] = [
  { r: 1.0 },
  { r: -1.0 },
  { r: 1.6 },
  { r: -1.0 },
  { r: 0.8 },
  { r: 2.1 },
  { r: -1.0, mistake: "late" },
  { r: -1.0 },
  { r: 1.2 },
  { r: -1.6, mistake: "stop" },
  { r: -1.0 },
  { r: -1.2, mistake: "revenge" },
  { r: 0.6 },
  { r: 2.4 },
  { r: -1.0 },
  { r: 1.1 },
  { r: 1.8 },
  { r: -1.0, mistake: "late" },
  { r: 0.9 },
  { r: -1.0 },
  { r: 2.2 },
  { r: 0.7 },
  { r: -1.0, mistake: "late" },
  { r: 1.5 },
  { r: -1.0 },
  { r: 1.9 },
  { r: 0.4 },
  { r: -1.0, mistake: "late" },
  { r: 1.3 },
  { r: 1.0 }
];

/** Histogram bins of half an R, from -2R to +2.5R (the last bin also takes anything above). */
const BIN_START = -2;
const BIN_WIDTH = 0.5;
const BIN_COUNT = 10;

const round = (value: number) => Math.round(value * 10) / 10;

function build() {
  const equity = [0];
  let peak = 0;
  let maxDrawdownR = 0;
  const mistakes = new Map<MistakeTag, { count: number; costR: number; first: number }>();

  trades.forEach((trade, position) => {
    const value = round(equity[equity.length - 1] + trade.r);
    equity.push(value);
    peak = Math.max(peak, value);
    maxDrawdownR = Math.max(maxDrawdownR, round(peak - value));
    if (trade.mistake) {
      const entry = mistakes.get(trade.mistake) ?? { count: 0, costR: 0, first: position + 1 };
      entry.count += 1;
      entry.costR = round(entry.costR + trade.r);
      mistakes.set(trade.mistake, entry);
    }
  });

  const broken = trades.filter((trade) => trade.mistake).length;
  const [repeatedTag, repeated] = [...mistakes.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  const pins = [...mistakes.entries()].map(([tag, entry]) => ({ index: entry.first, tag })).sort((a, b) => a.index - b.index);

  const histogram = Array.from({ length: BIN_COUNT }, (_, bin) => ({ from: round(BIN_START + bin * BIN_WIDTH), clean: 0, broken: 0 }));
  for (const trade of trades) {
    const bin = Math.min(BIN_COUNT - 1, Math.max(0, Math.floor((trade.r - BIN_START) / BIN_WIDTH)));
    histogram[bin][trade.mistake ? "broken" : "clean"] += 1;
  }

  return {
    trades,
    /** Cumulative result after each trade, starting at 0; index n is the state after n trades. */
    equity,
    pins,
    histogram,
    stats: {
      netR: equity[equity.length - 1],
      maxDrawdownR,
      adherencePct: Math.round((1 - broken / trades.length) * 100),
      repeated: { tag: repeatedTag, count: repeated.count, costR: repeated.costR }
    }
  };
}

export const sampleMonth = build();
