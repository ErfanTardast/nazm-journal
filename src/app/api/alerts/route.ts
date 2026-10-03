import { readId } from "@/lib/api/request";
import { ok, readJson, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { auditLog } from "@/lib/security/audit";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { createAlert, deleteAlert, listAlerts, updateAlert } from "@/lib/services/alerts";
import { alertCreateSchema, alertUpdateSchema } from "@/lib/validation/trading";

export async function GET() {
  return routeHandler(async () => {
    const user = await requireUser();
    return ok({ alerts: await listAlerts(user.id) });
  });
}

export async function POST(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "alerts:create", 40, 60);
    const user = await requireUser();
    const input = await readJson(request, alertCreateSchema);
    const alert = await createAlert(user.id, input);
    await auditLog({ userId: user.id, action: "alert.create", entity: "Alert", entityId: alert.id, request });
    return ok({ alert }, { status: 201 });
  });
}

export async function PATCH(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "alerts:update", 60, 60);
    const user = await requireUser();
    const input = await readJson(request, alertUpdateSchema);
    const alert = await updateAlert(user.id, input);
    await auditLog({ userId: user.id, action: "alert.update", entity: "Alert", entityId: alert.id, request });
    return ok({ alert });
  });
}

export async function DELETE(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "alerts:delete", 20, 60);
    const user = await requireUser();
    const id = await readId(request);
    const result = await deleteAlert(user.id, id);
    await auditLog({ userId: user.id, action: "alert.delete", entity: "Alert", entityId: id, request });
    return ok(result);
  });
}

