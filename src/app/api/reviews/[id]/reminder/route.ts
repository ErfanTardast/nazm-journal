import { ok, readJson, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { auditLog } from "@/lib/security/audit";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { resolveGeneratedLocale } from "@/lib/services/locale";
import { createReviewReminder } from "@/lib/services/reviews";
import { generatedTextLocaleBodySchema } from "@/lib/validation/trading";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "reviews:reminder", 30, 60);
    const user = await requireUser();
    const { id } = await context.params;
    const input = await readJson(request, generatedTextLocaleBodySchema);
    const alert = await createReviewReminder(user.id, id, resolveGeneratedLocale(input.locale, user.locale));
    await auditLog({
      userId: user.id,
      action: "review.reminder.create",
      entity: "Review",
      entityId: id,
      metadata: { alertId: alert.id },
      request
    });
    return ok({ alert }, { status: 201 });
  });
}
