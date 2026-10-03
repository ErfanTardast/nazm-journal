import { ok, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { getDashboardOverview } from "@/lib/services/dashboard";
import { resolveGeneratedLocale } from "@/lib/services/locale";

export async function GET(request: Request) {
  return routeHandler(async () => {
    const user = await requireUser();
    return ok(await getDashboardOverview(user.id, resolveGeneratedLocale(new URL(request.url).searchParams.get("locale"), user.locale)));
  });
}

