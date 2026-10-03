import { readId } from "@/lib/api/request";
import { ok, readJson, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { auditLog } from "@/lib/security/audit";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { resolveGeneratedLocale } from "@/lib/services/locale";
import { createReview, deleteReview, getReviewFocus, listReviews, updateReview } from "@/lib/services/reviews";
import { reviewCreateSchema, reviewStatusSchema, reviewTypeSchema, reviewUpdateSchema } from "@/lib/validation/trading";

export async function GET(request: Request) {
  return routeHandler(async () => {
    const user = await requireUser();
    const searchParams = new URL(request.url).searchParams;
    const typeParam = searchParams.get("type");
    const statusParam = searchParams.get("status");
    const type = typeParam ? reviewTypeSchema.parse(typeParam) : undefined;
    const status = statusParam ? reviewStatusSchema.parse(statusParam) : undefined;

    const [reviews, focus] = await Promise.all([listReviews(user.id, { type, status }), getReviewFocus(user.id)]);
    return ok({ reviews, focus });
  });
}

export async function POST(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "reviews:create", 40, 60);
    const user = await requireUser();
    const input = await readJson(request, reviewCreateSchema);
    const review = await createReview(user.id, input, resolveGeneratedLocale(input.locale, user.locale));
    await auditLog({ userId: user.id, action: "review.create", entity: "Review", entityId: review.id, request });
    return ok({ review }, { status: 201 });
  });
}

export async function PATCH(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "reviews:update", 80, 60);
    const user = await requireUser();
    const input = await readJson(request, reviewUpdateSchema);
    const result = await updateReview(user.id, input, resolveGeneratedLocale(input.locale, user.locale));
    await auditLog({ userId: user.id, action: "review.update", entity: "Review", entityId: result.review.id, request });
    return ok(result);
  });
}

export async function DELETE(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "reviews:delete", 30, 60);
    const user = await requireUser();
    const id = await readId(request);
    const result = await deleteReview(user.id, id);
    await auditLog({ userId: user.id, action: "review.delete", entity: "Review", entityId: id, request });
    return ok(result);
  });
}
