import { prisma } from "@/lib/db/prisma";
import {
  calculatePlaybookAdherence,
  type PlaybookAdherence,
  type RuleFollowStatus
} from "@/lib/calculations/playbook-adherence";

/**
 * Read-only: fetch the user's strategies (playbooks) + their tagged trades and compute per-playbook
 * adherence. No writes. Prisma `Decimal` rMultiple is coerced to a plain number for the pure calc.
 */
export async function getPlaybookAdherence(userId: string): Promise<PlaybookAdherence[]> {
  const [strategies, trades] = await Promise.all([
    prisma.strategy.findMany({
      where: { userId },
      select: { id: true, name: true, commonMistakes: true }
    }),
    prisma.trade.findMany({
      where: { userId, strategyId: { not: null } },
      select: { strategyId: true, ruleFollowed: true, rMultiple: true }
    })
  ]);

  const normalized = trades.map((t) => ({
    strategyId: t.strategyId,
    ruleFollowed: t.ruleFollowed as RuleFollowStatus,
    rMultiple: t.rMultiple == null ? null : Number(t.rMultiple)
  }));

  return calculatePlaybookAdherence(strategies, normalized);
}
