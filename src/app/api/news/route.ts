import { ok, routeHandler } from "@/lib/api/response";
import { isLocale } from "@/lib/i18n/locales";
import { listNews } from "@/lib/services/news";

export async function GET(request: Request) {
  return routeHandler(async () => {
    const locale = new URL(request.url).searchParams.get("locale");
    return ok({ news: await listNews(isLocale(locale) ? locale : "en") });
  });
}

