import { ok, readJson, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { auditLog } from "@/lib/security/audit";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { resolveGeneratedLocale } from "@/lib/services/locale";
import { generateReview } from "@/lib/services/reviews";
import { reviewGenerateSchema } from "@/lib/validation/trading";

export async function POST(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "reviews:generate", 30, 60);
    const user = await requireUser();
    const input = await readJson(request, reviewGenerateSchema);
    const result = await generateReview(user.id, input, resolveGeneratedLocale(input.locale, user.locale));
    await auditLog({
      userId: user.id,
      action: "review.generate",
      entity: "Review",
      entityId: result.review.id,
      metadata: { type: input.type, createReminder: input.createReminder },
      request
    });
    return ok(result, { status: 201 });
  });
}
