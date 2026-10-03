import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_COOKIE, LOCALE_HEADER, entryLocale, isLocale } from "@/lib/i18n/locales";

const PUBLIC_FILE = /\.(.*)$/;

/** Let the request through with the language header set from the URL (or removed: it is never taken from the browser). */
function pass(request: NextRequest, locale?: string) {
  const headers = new Headers(request.headers);
  if (locale) headers.set(LOCALE_HEADER, locale);
  else headers.delete(LOCALE_HEADER);
  return NextResponse.next({ request: { headers } });
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const firstSegment = pathname.split("/")[1];

  // /offline has no language prefix on purpose: the service worker caches that exact URL as the offline fallback.
  // A missing file under a language (/en/report.pdf) still renders the 404 in that language, so it keeps the locale.
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname === "/offline" ||
    PUBLIC_FILE.test(pathname)
  ) {
    return pass(request, isLocale(firstSegment) ? firstSegment : undefined);
  }

  if (isLocale(firstSegment)) {
    return pass(request, firstSegment);
  }

  const saved = request.cookies.get(LOCALE_COOKIE)?.value;
  const targetLocale = isLocale(saved) ? saved : entryLocale;
  const url = request.nextUrl.clone();
  url.pathname = pathname === "/" ? `/${targetLocale}` : `/${targetLocale}${pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
