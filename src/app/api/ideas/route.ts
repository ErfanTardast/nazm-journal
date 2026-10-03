import { readId } from "@/lib/api/request";
import { ok, readJson, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { auditLog } from "@/lib/security/audit";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { createIdea, deleteIdea, listIdeas, updateIdea } from "@/lib/services/ideas";
import { ideaCreateSchema, ideaStatusSchema, ideaTypeSchema, ideaUpdateSchema, marketSchema } from "@/lib/validation/trading";

export async function GET(request: Request) {
  return routeHandler(async () => {
    const user = await requireUser();
    const searchParams = new URL(request.url).searchParams;
    const query = searchParams.get("query") ?? undefined;
    const statusParam = searchParams.get("status");
    const marketParam = searchParams.get("market");
    const typeParam = searchParams.get("type");
    const status = statusParam ? ideaStatusSchema.parse(statusParam) : undefined;
    const market = marketParam ? marketSchema.parse(marketParam) : undefined;
    const type = typeParam ? ideaTypeSchema.parse(typeParam) : undefined;
    return ok({ ideas: await listIdeas(user.id, { query, status, market, type }) });
  });
}

export async function POST(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "ideas:create", 50, 60);
    const user = await requireUser();
    const input = await readJson(request, ideaCreateSchema);
    const idea = await createIdea(user.id, input);
    await auditLog({ userId: user.id, action: "idea.create", entity: "Idea", entityId: idea.id, request });
    return ok({ idea }, { status: 201 });
  });
}

export async function PATCH(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "ideas:update", 80, 60);
    const user = await requireUser();
    const input = await readJson(request, ideaUpdateSchema);
    const idea = await updateIdea(user.id, input);
    await auditLog({ userId: user.id, action: "idea.update", entity: "Idea", entityId: idea.id, request });
    return ok({ idea });
  });
}

export async function DELETE(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "ideas:delete", 30, 60);
    const user = await requireUser();
    const id = await readId(request);
    const result = await deleteIdea(user.id, id);
    await auditLog({ userId: user.id, action: "idea.delete", entity: "Idea", entityId: id, request });
    return ok(result);
  });
}
