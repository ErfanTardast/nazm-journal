import { notFound } from "@/lib/api/errors";
import { ok, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { auditLog } from "@/lib/security/audit";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { prisma } from "@/lib/db/prisma";
import { dispatch } from "@/lib/services/notifications";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "alerts:test-notify", 10, 60);
    const user = await requireUser();
    const { id } = await context.params;
    const alert = await prisma.alert.findFirst({ where: { id, userId: user.id } });
    if (!alert) throw notFound("Alert not found");

    await dispatch(
      { ...alert, condition: alert.condition as Record<string, unknown> },
      { title: "Test notification", body: alert.message }
    );
    await auditLog({ userId: user.id, action: "alert.test-notify", entity: "Alert", entityId: id, request });
    return ok({ dispatched: true });
  });
}
