import { ok, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { getAdminOverview } from "@/lib/services/admin";

export async function GET() {
  return routeHandler(async () => {
    const user = await requireUser();
    return ok(await getAdminOverview(user));
  });
}

