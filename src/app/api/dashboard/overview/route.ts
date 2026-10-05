import { ok, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { getDashboardOverview } from "@/lib/services/dashboard";
import { resolveGeneratedLocale } from "@/lib/services/locale";

export async function GET(request: Request) {
  return routeHandler(async () => {
    const user = await requireUser();
    const locale = resolveGeneratedLocale(new URL(request.url).searchParams.get("locale"), user.locale);
    // Today and the 7 and 30 day windows follow the time zone saved in Settings.
    return ok(await getDashboardOverview(user.id, locale, { timeZone: user.timezone }));
  });
}
