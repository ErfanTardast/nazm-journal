import { ok, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { getDisciplineOverview } from "@/lib/services/discipline";
import { resolveGeneratedLocale } from "@/lib/services/locale";

export async function GET(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "discipline:overview", 30, 60);
    const user = await requireUser();
    // The alert and check sentences follow ?locale=, else the language saved in the user's settings, else Persian.
    const locale = resolveGeneratedLocale(new URL(request.url).searchParams.get("locale"), user.locale);
    return ok(await getDisciplineOverview(user.id, locale));
  });
}
