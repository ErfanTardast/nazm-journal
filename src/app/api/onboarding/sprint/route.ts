import { z } from "zod";
import { ok, readJson, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { auditLog } from "@/lib/security/audit";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { resolveGeneratedLocale } from "@/lib/services/locale";
import { getOnboardingProfile, saveOnboardingProfile } from "@/lib/services/onboarding";

const onboardingSaveSchema = z
  .object({
    experience: z.unknown().optional(),
    market: z.unknown().optional(),
    disciplineIssue: z.unknown().optional(),
    language: z.unknown().optional()
  })
  .strict();

export async function GET(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "onboarding:sprint:read", 30, 60);
    const user = await requireUser();
    return ok({ profile: await getOnboardingProfile(user.id) });
  });
}

export async function POST(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "onboarding:sprint:save", 10, 60);
    const user = await requireUser();
    const input = await readJson(request, onboardingSaveSchema);
    const profile = await saveOnboardingProfile(user.id, { ...input, language: resolveGeneratedLocale(input.language, user.locale) });
    await auditLog({
      userId: user.id,
      action: "onboarding.sprint.save",
      entity: "OnboardingProfile",
      entityId: profile.id,
      metadata: {
        segment: profile.segment,
        starterStrategyId: profile.starterStrategyId,
        firstReviewId: profile.firstReviewId
      },
      request
    });
    return ok({ profile });
  });
}
