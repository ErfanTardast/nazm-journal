import { ok, readJson, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { buildRefusalResponse, screenAiRequest } from "@/lib/ai/guard";
import { auditLog } from "@/lib/security/audit";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { getAiProvider } from "@/lib/services/ai";
import { buildReviewContext } from "@/lib/services/ai/coach-context";
import { resolveGeneratedLocale } from "@/lib/services/locale";
import { aiReviewTradeSchema } from "@/lib/validation/trading";

export async function POST(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "ai:review-trade", 20, 60);
    const user = await requireUser();
    const input = await readJson(request, aiReviewTradeSchema);
    const locale = resolveGeneratedLocale(input.locale, user.locale);

    // Refuse signal/advice/price-target/execution requests BEFORE any provider call.
    const screen = screenAiRequest(input.notes ?? "");
    if (!screen.allowed) {
      const review = buildRefusalResponse(input.mode, locale);
      await auditLog({ userId: user.id, action: "ai.review_trade.refused", entity: "AiReview",
        metadata: { symbol: input.symbol, matched: screen.matched }, request });
      return ok({ review, refused: true });
    }

    const review = await getAiProvider().reviewTrade(user.id, input, locale);
    // Ground the review in the operator's saved context (discipline, mistakes, active session,
    // the written plan for this symbol, overdue reviews, and the discipline streak).
    const ctx = await buildReviewContext(user.id, input.symbol, locale);
    const enriched = ctx.observations.length || ctx.nextActions.length
      ? { ...review, observations: [...review.observations, ...ctx.observations],
          nextActions: [...review.nextActions, ...ctx.nextActions] }
      : review;
    await auditLog({ userId: user.id, action: "ai.review_trade", entity: "AiReview", metadata: { symbol: input.symbol }, request });
    return ok({ review: enriched, refused: false });
  });
}

