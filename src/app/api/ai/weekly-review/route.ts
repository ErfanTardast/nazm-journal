import { ok, readJson, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { auditLog } from "@/lib/security/audit";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { getAiProvider } from "@/lib/services/ai";
import { resolveGeneratedLocale } from "@/lib/services/locale";
import { aiModeSchema } from "@/lib/validation/trading";

export async function POST(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "ai:weekly-review", 20, 60);
    const user = await requireUser();
    const input = await readJson(request, aiModeSchema);
    const review = await getAiProvider().weeklyReview(user.id, input.mode, resolveGeneratedLocale(input.locale, user.locale));
    await prisma.aiReview.create({
      data: { userId: user.id, mode: input.mode, workflow: "weekly-review", input, output: review, disclaimer: review.disclaimer }
    });
    await auditLog({ userId: user.id, action: "ai.weekly_review", entity: "AiReview", request });
    return ok({ review });
  });
}

