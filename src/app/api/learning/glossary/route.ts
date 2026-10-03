import { ok, routeHandler } from "@/lib/api/response";
import { isLocale } from "@/lib/i18n/locales";
import { learningTemplates, listGlossary } from "@/lib/services/learning";

export async function GET(request: Request) {
  return routeHandler(async () => {
    const locale = new URL(request.url).searchParams.get("locale");
    const safeLocale = isLocale(locale) ? locale : "en";
    return ok({ glossary: await listGlossary(safeLocale), templates: learningTemplates(safeLocale) });
  });
}

