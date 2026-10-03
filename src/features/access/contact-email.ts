type Env = Record<string, string | undefined>;

/** One plain address: no spaces, no `mailto:`, no `?cc=` tail, no angle brackets. */
const PLAIN_ADDRESS = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

/**
 * The public contact address from NEXT_PUBLIC_CONTACT_EMAIL, or null when it is not set (or is not one plain address).
 * The privacy page and the request-access page both read it through this function, so they always agree: with an
 * address they offer "ask us to delete your request" at it, without one they say nothing about it, because there would
 * be no way to do it. It is read on the server for each request (both pages render per request), so the screens that
 * run in the browser get it as a prop.
 */
export function contactEmail(env: Env = process.env): string | null {
  const value = (env.NEXT_PUBLIC_CONTACT_EMAIL ?? "").trim();
  return value.length > 0 && value.length <= 254 && PLAIN_ADDRESS.test(value) ? value : null;
}
