import { ok, readJson, routeHandler } from "@/lib/api/response";
import { requireAdminUser } from "@/lib/auth/require-admin";
import { auditLog } from "@/lib/security/audit";
import { deleteAccessRequest, setAccessRequestStatus } from "@/lib/services/access-requests";
import { accessRequestStatusSchema } from "@/lib/validation/access";

/** Admin-only: mark one request invited, declined, or back to new. The decision goes to the audit log. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return routeHandler(async () => {
    const user = await requireAdminUser();
    const { id } = await params;
    const { status } = await readJson(request, accessRequestStatusSchema);
    const result = await setAccessRequestStatus(id, status);
    await auditLog({
      userId: user.id,
      action: "access.review",
      entity: "AccessRequest",
      entityId: id,
      metadata: { status },
      request
    });
    return ok(result);
  });
}

/** Admin-only: delete one request (for example when its owner asks). The audit entry keeps no name, e-mail or note. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return routeHandler(async () => {
    const user = await requireAdminUser();
    const { id } = await params;
    await deleteAccessRequest(id);
    await auditLog({ userId: user.id, action: "access.delete", entity: "AccessRequest", entityId: id, request });
    return ok({ id, deleted: true });
  });
}
