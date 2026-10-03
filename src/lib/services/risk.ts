import {
  calculateForexLotSize,
  calculatePositionSize,
  calculateRewardRisk,
  calculateStopLossDistance,
  estimateLiquidation
} from "@/lib/calculations/risk";
import type { z } from "zod";
import type { riskCalculatorSchema } from "@/lib/validation/trading";

export function runRiskCalculators(input: z.infer<typeof riskCalculatorSchema>) {
  return {
    positionSize: input.positionSize ? calculatePositionSize(input.positionSize) : null,
    forexLotSize: input.forexLotSize ? calculateForexLotSize(input.forexLotSize) : null,
    liquidation: input.liquidation ? estimateLiquidation(input.liquidation) : null,
    rewardRisk: input.rewardRisk
      ? calculateRewardRisk(input.rewardRisk.entryPrice, input.rewardRisk.stopLoss, input.rewardRisk.takeProfit)
      : null,
    stopLossDistance: input.stopLossDistance
      ? calculateStopLossDistance(input.stopLossDistance.entryPrice, input.stopLossDistance.stopLoss)
      : null,
    warning:
      "These calculators support planning and discipline only. They do not recommend buying, selling, or placing orders."
  };
}

