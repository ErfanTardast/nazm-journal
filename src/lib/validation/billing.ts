import { z } from "zod";

export const paidTierSchema = z.enum(["pro", "elite"]);
export const paymentMethodSchema = z.enum(["card_to_card", "usdt_trc20"]);
export const paymentStatusSchema = z.enum(["awaiting_transfer", "pending", "approved", "rejected", "refunded"]);

export const submitPaymentSchema = z.object({
  tier: paidTierSchema,
  method: paymentMethodSchema,
  trackingCode: z.string().trim().min(6).max(128),
  paidAt: z.coerce.date(),
  intentId: z.string().min(1).max(128).optional()
});

export const usdtIntentSchema = z.object({ tier: paidTierSchema });

export const reviewPaymentSchema = z.object({
  action: z.enum(["approve", "reject", "refund"]),
  note: z.string().trim().max(500).optional()
});
