import { z } from "zod";
import {
  ACCESS_NAME_MAX,
  ACCESS_NAME_MIN,
  ACCESS_NOTE_MAX,
  CONTROL_CHARACTERS_MESSAGE,
  accessRequestStatuses,
  hasForbiddenCharacter,
  tradingPlatforms
} from "@/lib/validation/access-fields";

export * from "@/lib/validation/access-fields";

/**
 * The public "request access" form. `website` is a honeypot: the page hides that input from people, so only a script
 * that fills every field puts text in it. As a field of the schema it must be empty or absent; the API route catches a
 * filled one earlier (see parseAccessRequest) so that it can answer like a success without keeping anything.
 */
export const accessRequestSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(ACCESS_NAME_MIN)
      .max(ACCESS_NAME_MAX)
      .refine((name) => !hasForbiddenCharacter(name), { message: CONTROL_CHARACTERS_MESSAGE }),
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    tradingPlatform: z.enum(tradingPlatforms).optional(),
    note: z
      .string()
      .trim()
      .max(ACCESS_NOTE_MAX)
      .refine((note) => !hasForbiddenCharacter(note, true), { message: CONTROL_CHARACTERS_MESSAGE })
      .transform((note) => note || undefined)
      .optional(),
    locale: z.enum(["fa", "en"]),
    website: z.string().trim().max(0).optional()
  })
  .strict();

export type AccessRequestInput = z.infer<typeof accessRequestSchema>;

/** Admin decision on one request: the status it moves to (including back to "new"). */
export const accessRequestStatusSchema = z.object({ status: z.enum(accessRequestStatuses) }).strict();

/** True when the hidden honeypot field holds anything (a person never sees it, so a script filled it). */
export function isHoneypotFilled(body: unknown) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return false;
  const value = (body as Record<string, unknown>).website;
  if (value === undefined || value === null) return false;
  return typeof value === "string" ? value.trim() !== "" : true;
}

/**
 * A script that filled the honeypot is told nothing: it comes back as { bot: true } before any other field is checked,
 * so it gets no validation errors to learn from. Anything else is validated (a ZodError when it is not valid).
 */
export function parseAccessRequest(body: unknown): { bot: true } | { bot: false; data: AccessRequestInput } {
  if (isHoneypotFilled(body)) return { bot: true };
  return { bot: false, data: accessRequestSchema.parse(body) };
}
