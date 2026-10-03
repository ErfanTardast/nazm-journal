import { ok, routeHandler } from "@/lib/api/response";
import { requireAdminUser } from "@/lib/auth/require-admin";
import { listAccessRequests } from "@/lib/services/access-requests";
import { accessRequestStatuses } from "@/lib/validation/access-fields";

/** Admin-only list of the requests for an invite; `?status=` filters, anything unknown lists all. */
export async function GET(request: Request) {
  return routeHandler(async () => {
    await requireAdminUser();
    const wanted = new URL(request.url).searchParams.get("status");
    return ok(await listAccessRequests(accessRequestStatuses.find((status) => status === wanted)));
  });
}
