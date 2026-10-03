/** Control characters and the backslash (which browsers treat as a slash). */
function isUnsafeChar(char: string) {
  const code = char.charCodeAt(0);
  return code < 0x20 || code === 0x7f || char === "\\";
}

/**
 * A page to come back to after signing in (`/login?next=/fa/journal`). Only a same-origin path inside the current
 * language is accepted: anything else (another origin, a protocol-relative `//host`, a backslash trick, another
 * language, the sign-in pages themselves) is ignored, so the parameter cannot be used as an open redirect.
 */
export function safeNextPath(value: unknown, locale: string): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string" || raw.length > 512) return null;
  if (!raw.startsWith(`/${locale}/`) || [...raw].some(isUnsafeChar)) return null;

  let url: URL;
  try {
    url = new URL(raw, "http://localhost");
  } catch {
    return null;
  }
  if (url.origin !== "http://localhost" || !url.pathname.startsWith(`/${locale}/`)) return null;

  const page = url.pathname.split("/")[2];
  if (page === "login" || page === "register") return null;
  return `${url.pathname}${url.search}`;
}
