import { z } from "zod";
import { PRIMARY_GOALS, TRADING_PLATFORMS } from "@/lib/onboarding/first-run";

export const tradingPlatformSchema = z.enum(TRADING_PLATFORMS);
export const primaryGoalSchema = z.enum(PRIMARY_GOALS);

/**
 * What a screen may save of the first run. Each field is optional, at least one must be sent, and only what is sent changes. `done` can only be
 * `true`: finishing and skipping are the same thing, and nothing takes the flow back to "not seen yet". Unknown keys
 * and unknown values are refused.
 */
export const onboardingStateInputSchema = z
  .object({
    tradingPlatform: tradingPlatformSchema.optional(),
    primaryGoal: primaryGoalSchema.optional(),
    done: z.literal(true).optional()
  })
  .strict()
  // An empty or garbled body reads as `{}`: it would save nothing, so it is refused instead of answered as a save.
  .refine((input) => Object.values(input).some((value) => value !== undefined), { message: "Send an answer or done" });
export type OnboardingStateInput = z.infer<typeof onboardingStateInputSchema>;
