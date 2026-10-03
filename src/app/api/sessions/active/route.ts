import { ok, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { getActiveSession } from "@/lib/services/sessions";

export async function GET() {
  return routeHandler(async () => {
    const user = await requireUser();
    return ok({ session: await getActiveSession(user.id) });
  });
}
