export type PortfolioTransactionInput = {
  side: "long" | "short";
  quantity: number;
  price: number;
  fees: number;
};

export type HoldingSnapshot = {
  quantity: number;
  averageEntry: number;
  realizedPnl: number;
  cashBalance: number;
};

export function applyPortfolioTransaction(
  holding: HoldingSnapshot,
  transaction: PortfolioTransactionInput
): HoldingSnapshot {
  if (transaction.quantity <= 0 || transaction.price <= 0) {
    throw new Error("Transaction quantity and price must be greater than zero");
  }

  if (transaction.side === "long") {
    const totalCost = holding.quantity * holding.averageEntry + transaction.quantity * transaction.price;
    const nextQuantity = holding.quantity + transaction.quantity;
    return {
      quantity: nextQuantity,
      averageEntry: nextQuantity > 0 ? totalCost / nextQuantity : 0,
      realizedPnl: holding.realizedPnl,
      cashBalance: holding.cashBalance - transaction.quantity * transaction.price - transaction.fees
    };
  }

  const sellQuantity = Math.min(transaction.quantity, holding.quantity);
  const realized = (transaction.price - holding.averageEntry) * sellQuantity - transaction.fees;
  const nextQuantity = holding.quantity - sellQuantity;
  return {
    quantity: nextQuantity,
    averageEntry: nextQuantity > 0 ? holding.averageEntry : 0,
    realizedPnl: holding.realizedPnl + realized,
    cashBalance: holding.cashBalance + transaction.quantity * transaction.price - transaction.fees
  };
}

export function calculateUnrealizedPnl(quantity: number, averageEntry: number, currentPrice: number) {
  return (currentPrice - averageEntry) * quantity;
}

