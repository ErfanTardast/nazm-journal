import { z } from "zod";
import { isSupportedTimeZone } from "@/lib/time/zones";
import { normalizeNumberInput } from "@/lib/validation/number-input";

const passwordSchema = z
  .string()
  .min(12)
  .max(128)
  .regex(/[A-Z]/, "Password must include an uppercase letter")
  .regex(/[a-z]/, "Password must include a lowercase letter")
  .regex(/[0-9]/, "Password must include a number");

export const registerSchema = z
  .object({
    email: z.email().toLowerCase(),
    password: passwordSchema,
    name: z.string().min(2).max(80),
    /** Required only while REGISTRATION_INVITE_CODE is set (an invite-only trial). */
    inviteCode: z.string().max(128).optional(),
    /** The page language the person signed up in; becomes the account's saved language. */
    locale: z.enum(["en", "fa"]).optional()
  })
  .strict();

export const loginSchema = z
  .object({
    email: z.email().toLowerCase(),
    password: z.string().min(1).max(128),
    totpCode: z.string().regex(/^\d{6}$/).optional()
  })
  .strict();

export const passwordResetRequestSchema = z
  .object({
    email: z.email().toLowerCase()
  })
  .strict();

export const passwordResetConfirmSchema = z
  .object({
    token: z.string().min(24).max(256),
    password: passwordSchema
  })
  .strict();

/**
 * Changing the password while signed in. The current password only has to be present (an account made under older
 * rules must still be able to change it); the new one follows the same rules as sign-up.
 */
export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: passwordSchema
  })
  .strict();

export const totpVerifySchema = z
  .object({
    code: z.string().regex(/^\d{6}$/)
  })
  .strict();

export const userSettingsSchema = z
  .object({
    locale: z.enum(["en", "fa"]).optional(),
    theme: z.enum(["dark", "light", "system"]).optional(),
    timezone: z.string().min(2).max(80).optional(),
    riskPerTradePct: z.preprocess(normalizeNumberInput, z.coerce.number().positive().max(25)).optional(),
    maxDailyLossPct: z.preprocess(normalizeNumberInput, z.coerce.number().positive().max(50)).optional(),
    maxWeeklyLossPct: z.preprocess(normalizeNumberInput, z.coerce.number().positive().max(80)).optional(),
    // The settings form sends text (possibly Persian digits); an emptied field clears the balance.
    startingBalance: z
      .preprocess(
        (value) => {
          const text = normalizeNumberInput(value);
          return text === "" ? null : text;
        },
        z.coerce.number().positive().max(1_000_000_000_000).nullable()
      )
      .optional(),
    brokerTimeZone: z.string().max(64).refine(isSupportedTimeZone, "Unknown time zone").nullable().optional()
  })
  .strict();

export const accountDeletionSchema = z
  .object({
    confirmationEmail: z.email().toLowerCase(),
    confirmationText: z.literal("DELETE"),
    password: z.string().min(1).max(128)
  })
  .strict();
