export type PositionSizeInput = {
  accountBalance: number;
  riskPercent: number;
  entryPrice: number;
  stopLoss: number;
  feeBuffer?: number;
};

export function calculatePositionSize(input: PositionSizeInput) {
  const riskAmount = input.accountBalance * (input.riskPercent / 100);
  const stopDistance = Math.abs(input.entryPrice - input.stopLoss);
  if (stopDistance <= 0) {
    throw new Error("Stop distance must be greater than zero");
  }

  const feeBuffer = input.feeBuffer ?? 0;
  const effectiveRisk = Math.max(riskAmount - feeBuffer, 0);
  const quantity = effectiveRisk / stopDistance;
  return {
    riskAmount,
    stopDistance,
    quantity,
    notionalValue: quantity * input.entryPrice
  };
}

export type ForexLotInput = {
  accountBalance: number;
  riskPercent: number;
  stopLossPips: number;
  pipValuePerStandardLot?: number;
};

export function calculateForexLotSize(input: ForexLotInput) {
  const riskAmount = input.accountBalance * (input.riskPercent / 100);
  const pipValue = input.pipValuePerStandardLot ?? 10;
  if (input.stopLossPips <= 0 || pipValue <= 0) {
    throw new Error("Stop loss pips and pip value must be greater than zero");
  }

  const standardLots = riskAmount / (input.stopLossPips * pipValue);
  return {
    riskAmount,
    standardLots,
    miniLots: standardLots * 10,
    microLots: standardLots * 100
  };
}

export type LiquidationInput = {
  side: "long" | "short";
  entryPrice: number;
  leverage: number;
  maintenanceMarginPercent?: number;
};

export function estimateLiquidation(input: LiquidationInput) {
  if (input.entryPrice <= 0 || input.leverage <= 0) {
    throw new Error("Entry price and leverage must be greater than zero");
  }

  const maintenance = (input.maintenanceMarginPercent ?? 0.5) / 100;
  const leverageMove = 1 / input.leverage;
  const liquidationPrice =
    input.side === "long"
      ? input.entryPrice * (1 - leverageMove + maintenance)
      : input.entryPrice * (1 + leverageMove - maintenance);

  return {
    liquidationPrice,
    distance: Math.abs(input.entryPrice - liquidationPrice),
    distancePercent: Math.abs(input.entryPrice - liquidationPrice) / input.entryPrice,
    warning:
      input.leverage >= 20
        ? "High leverage can cause liquidation during normal volatility. This is an estimate for planning, not execution advice."
        : "This is an educational estimate. Trading venues use different maintenance margin formulas."
  };
}

export function calculateRewardRisk(entryPrice: number, stopLoss: number, takeProfit: number) {
  const risk = Math.abs(entryPrice - stopLoss);
  const reward = Math.abs(takeProfit - entryPrice);
  if (risk <= 0) {
    throw new Error("Risk distance must be greater than zero");
  }
  return {
    riskDistance: risk,
    rewardDistance: reward,
    rewardRiskRatio: reward / risk
  };
}

export function calculateStopLossDistance(entryPrice: number, stopLoss: number) {
  const distance = Math.abs(entryPrice - stopLoss);
  if (entryPrice <= 0) {
    throw new Error("Entry price must be greater than zero");
  }
  return {
    distance,
    distancePercent: distance / entryPrice
  };
}
