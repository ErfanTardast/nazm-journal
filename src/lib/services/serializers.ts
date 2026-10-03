export function toNumber(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }
  return Number(value);
}

export function serializeTrade<T extends Record<string, unknown>>(trade: T) {
  return {
    ...trade,
    entryPrice: toNumber(trade.entryPrice),
    exitPrice: toNumber(trade.exitPrice),
    stopLoss: toNumber(trade.stopLoss),
    takeProfit: toNumber(trade.takeProfit),
    quantity: toNumber(trade.quantity),
    riskAmount: toNumber(trade.riskAmount),
    riskPercent: toNumber(trade.riskPercent),
    rMultiple: toNumber(trade.rMultiple),
    realizedPnl: toNumber(trade.realizedPnl),
    fees: toNumber(trade.fees)
  };
}

export function serializePortfolio<T extends Record<string, unknown>>(portfolio: T) {
  return {
    ...portfolio,
    cashBalance: toNumber(portfolio.cashBalance)
  };
}

export function serializeHolding<T extends Record<string, unknown>>(holding: T) {
  return {
    ...holding,
    quantity: toNumber(holding.quantity),
    averageEntry: toNumber(holding.averageEntry),
    realizedPnl: toNumber(holding.realizedPnl)
  };
}
