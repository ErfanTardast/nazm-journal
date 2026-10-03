import { calculateMaxDrawdown } from "./journal";

export type BacktestTradeInput = {
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  side: "long" | "short";
  fees?: number;
};

export function calculateBacktestMetrics(startingBalance: number, trades: BacktestTradeInput[]) {
  const pnls = trades.map((trade) => {
    const direction = trade.side === "long" ? 1 : -1;
    return (trade.exitPrice - trade.entryPrice) * direction * trade.quantity - (trade.fees ?? 0);
  });
  const wins = pnls.filter((pnl) => pnl > 0);
  const losses = pnls.filter((pnl) => pnl < 0);
  const grossProfit = wins.reduce((sum, pnl) => sum + pnl, 0);
  const grossLoss = losses.reduce((sum, pnl) => sum + Math.abs(pnl), 0);
  const equityCurve = pnls.reduce<{ index: number; equity: number }[]>((curve, pnl, index) => {
    const previous = curve[curve.length - 1]?.equity ?? startingBalance;
    curve.push({ index: index + 1, equity: previous + pnl });
    return curve;
  }, []);

  return {
    totalTrades: trades.length,
    winRate: trades.length ? wins.length / trades.length : 0,
    averageWin: wins.length ? grossProfit / wins.length : 0,
    averageLoss: losses.length ? grossLoss / losses.length : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Number.POSITIVE_INFINITY : 0,
    netPnl: grossProfit - grossLoss,
    endingBalance: equityCurve[equityCurve.length - 1]?.equity ?? startingBalance,
    maxDrawdown: calculateMaxDrawdown(equityCurve.map((point) => point.equity)),
    sharpeLike: pnls.length > 1 ? average(pnls) / standardDeviation(pnls) : 0,
    equityCurve
  };
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function standardDeviation(values: number[]) {
  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance) || 1;
}

