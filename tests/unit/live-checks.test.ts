import { describe, expect, it } from "vitest";
import { runLiveChecks, type LiveCheck } from "@/lib/deploy/live-checks";

type Handler = (request: Request) => Response | Promise<Response>;

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "strict-transport-security": "max-age=31536000; includeSubDomains"
};

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: SECURITY_HEADERS });
const html = (body: string, status = 200) => new Response(body, { status, headers: { ...SECURITY_HEADERS, "content-type": "text/html" } });
const streamedNotFound = () => html('<meta name="robots" content="noindex"/><script>self.__next_f.push([1,"NEXT_HTTP_ERROR_FALLBACK;404"])</script>');

/** A healthy trial deployment behind one proxy that appends the real client address. */
function trialServer(overrides: Record<string, Handler> = {}) {
  let loginAttempts = 0;
  const routes: Record<string, Handler> = {
    "GET /api/health": () => json({ status: "ok", database: "ok" }),
    "GET /fa": () => html("<html>landing</html>"),
    "GET /api/billing": () => json({ error: { code: "NOT_FOUND" } }, 404),
    "POST /api/billing/payments": () => json({ error: { code: "NOT_FOUND" } }, 404),
    "POST /api/billing/usdt-intents": () => json({ error: { code: "NOT_FOUND" } }, 404),
    "GET /api/admin/payments": () => json({ error: { code: "NOT_FOUND" } }, 404),
    "GET /api/demo/story": () => json({ error: { code: "NOT_FOUND" } }, 404),
    "GET /fa/billing": streamedNotFound,
    "GET /en/billing": streamedNotFound,
    "GET /fa/demo": () => html("not found", 404),
    "GET /en/demo": streamedNotFound,
    "POST /api/auth/register": () => json({ error: { code: "INVITE_REQUIRED", message: "A valid invite code is needed" } }, 403),
    "POST /api/auth/login": () => {
      loginAttempts += 1;
      return loginAttempts > 10 ? json({ error: { code: "RATE_LIMITED" } }, 429) : json({ error: { code: "INVALID_CREDENTIALS" } }, 401);
    },
    ...overrides
  };
  const requests: Request[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    requests.push(request);
    const url = new URL(request.url);
    if (url.protocol === "http:" && !overrides["http"]) {
      return new Response(null, { status: 308, headers: { location: `https://${url.host}${url.pathname}` } });
    }
    const handler = (url.protocol === "http:" ? overrides["http"] : undefined) ?? routes[`${request.method} ${url.pathname}`];
    if (handler) return handler(request);
    if (url.pathname.startsWith("/api/")) return json({ error: { code: "NOT_FOUND", message: "Not found" } }, 404);
    return html("<h1>404</h1>", 404);
  }) as typeof fetch;
  return { fetchImpl, requests };
}

const BASE = "https://trial.example.run";
const byName = (checks: LiveCheck[], name: string) => {
  const check = checks.find((item) => item.name === name);
  if (!check) throw new Error(`no check named ${name}`);
  return check;
};
const failed = (checks: LiveCheck[]) => checks.filter((check) => !check.ok).map((check) => check.name);

describe("runLiveChecks", () => {
  it("passes a healthy invite-only trial with payments and demo hidden", async () => {
    const { fetchImpl } = trialServer();
    const checks = await runLiveChecks(BASE, { fetch: fetchImpl, probeId: "t1" });

    expect(failed(checks)).toEqual([]);
    expect(checks.map((check) => check.name)).toEqual([
      "health",
      "security headers",
      "payment/demo APIs hidden",
      "payment/demo pages hidden",
      "sign-up needs the invite code",
      "no stack traces in errors",
      "http redirects to https",
      "forged X-Forwarded-For cannot dodge the login limit"
    ]);
  });

  it("fails health when the database is unreachable, and survives a network error", async () => {
    const degraded = trialServer({ "GET /api/health": () => json({ status: "degraded", database: "unreachable" }, 503) });
    expect(byName(await runLiveChecks(BASE, { fetch: degraded.fetchImpl, probeId: "t2" }), "health").ok).toBe(false);

    const down = trialServer({
      "GET /api/health": () => {
        throw new TypeError("fetch failed");
      }
    });
    const check = byName(await runLiveChecks(BASE, { fetch: down.fetchImpl, probeId: "t3" }), "health");
    expect(check.ok).toBe(false);
    expect(check.detail).toContain("fetch failed");
  });

  it("fails security headers without HSTS on https, or with X-Powered-By", async () => {
    const { "strict-transport-security": _hsts, ...withoutHsts } = SECURITY_HEADERS;
    const noHsts = trialServer({ "GET /api/health": () => Response.json({ status: "ok", database: "ok" }, { headers: withoutHsts }) });
    const check = byName(await runLiveChecks(BASE, { fetch: noHsts.fetchImpl, probeId: "t4" }), "security headers");
    expect(check.ok).toBe(false);
    expect(check.detail).toContain("strict-transport-security");

    const powered = trialServer({ "GET /fa": () => new Response("<html></html>", { headers: { ...SECURITY_HEADERS, "x-powered-by": "Next.js" } }) });
    expect(byName(await runLiveChecks(BASE, { fetch: powered.fetchImpl, probeId: "t5" }), "security headers").ok).toBe(false);
  });

  it("fails when a payment or demo API answers, including with 405 for the wrong method", async () => {
    const open = trialServer({ "POST /api/billing/usdt-intents": () => json({ error: { code: "UNAUTHORIZED" } }, 401) });
    const check = byName(await runLiveChecks(BASE, { fetch: open.fetchImpl, probeId: "t6" }), "payment/demo APIs hidden");
    expect(check.ok).toBe(false);
    expect(check.detail).toContain("/api/billing/usdt-intents");

    const { fetchImpl, requests } = trialServer();
    await runLiveChecks(BASE, { fetch: fetchImpl, probeId: "t7" });
    // POST-only routes are probed with POST: a GET would get 405 even while the gate works.
    expect(requests.some((request) => request.method === "POST" && request.url.endsWith("/api/billing/payments"))).toBe(true);
  });

  it("fails when a billing or demo page renders instead of not-found", async () => {
    const open = trialServer({ "GET /en/billing": () => html("<h1>Choose a plan</h1>") });
    const check = byName(await runLiveChecks(BASE, { fetch: open.fetchImpl, probeId: "t8" }), "payment/demo pages hidden");
    expect(check.ok).toBe(false);
    expect(check.detail).toContain("/en/billing");
  });

  it("fails loudly when sign-up works without the right invite code", async () => {
    const open = trialServer({ "POST /api/auth/register": () => json({ data: { user: { id: "u1" } } }, 201) });
    const check = byName(await runLiveChecks(BASE, { fetch: open.fetchImpl, probeId: "t9" }), "sign-up needs the invite code");
    expect(check.ok).toBe(false);
    expect(check.detail).toContain("deploy-check-t9");
  });

  it("says the invite code variable is missing when sign-up is closed altogether", async () => {
    const closed = trialServer({ "POST /api/auth/register": () => json({ error: { code: "REGISTRATION_CLOSED", message: "Sign-up is closed" } }, 403) });
    const check = byName(await runLiveChecks(BASE, { fetch: closed.fetchImpl, probeId: "t16" }), "sign-up needs the invite code");
    expect(check.ok).toBe(false);
    expect(check.detail).toContain("REGISTRATION_INVITE_CODE is not set");
  });

  it("reminds to confirm in the server log which address the login limit was keyed on", async () => {
    const { fetchImpl } = trialServer();
    const check = byName(await runLiveChecks(BASE, { fetch: fetchImpl, probeId: "t17" }), "forged X-Forwarded-For cannot dodge the login limit");
    expect(check.detail).toMatch(/rate limited: auth:login/);
  });

  it("probes sign-up with a valid form, once without a code and once with a wrong one", async () => {
    const { fetchImpl, requests } = trialServer();
    await runLiveChecks(BASE, { fetch: fetchImpl, probeId: "t10" });
    const bodies = await Promise.all(
      requests.filter((request) => request.url.endsWith("/api/auth/register")).map((request) => request.clone().json())
    );

    expect(bodies).toHaveLength(2);
    expect(bodies[0]).not.toHaveProperty("inviteCode");
    expect(typeof bodies[1].inviteCode).toBe("string");
    for (const body of bodies) {
      expect(body.email).toMatch(/^deploy-check-t10(-\w+)?@example\.com$/);
      expect(body.password).toMatch(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{12,128}$/);
      expect(body.name.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("fails when error responses leak a stack trace or server paths", async () => {
    const leaky = trialServer({
      "POST /api/auth/login": () =>
        json({ error: { message: "TypeError: x is undefined\n    at handler (/app/.next/server/app/api/auth/login/route.js:1:234)" } }, 500)
    });
    const check = byName(await runLiveChecks(BASE, { fetch: leaky.fetchImpl, probeId: "t11" }), "no stack traces in errors");
    expect(check.ok).toBe(false);
  });

  it("fails when plain http is served instead of redirected, and skips it for an http base", async () => {
    const plain = trialServer({ http: () => html("<html>landing</html>") });
    expect(byName(await runLiveChecks(BASE, { fetch: plain.fetchImpl, probeId: "t12" }), "http redirects to https").ok).toBe(false);

    const { fetchImpl } = trialServer();
    const local = byName(await runLiveChecks("http://localhost:3000", { fetch: fetchImpl, probeId: "t13" }), "http redirects to https");
    expect(local).toMatchObject({ ok: true, skipped: true });
  });

  it("fails when a new forged X-Forwarded-For each time avoids the login limit", async () => {
    const bypass = trialServer({ "POST /api/auth/login": () => json({ error: { code: "INVALID_CREDENTIALS" } }, 401) });
    const check = byName(await runLiveChecks(BASE, { fetch: bypass.fetchImpl, probeId: "t14" }), "forged X-Forwarded-For cannot dodge the login limit");
    expect(check.ok).toBe(false);

    const { fetchImpl, requests } = trialServer();
    await runLiveChecks(BASE, { fetch: fetchImpl, probeId: "t15" });
    const forged = requests
      .filter((request) => request.url.endsWith("/api/auth/login"))
      .map((request) => request.headers.get("x-forwarded-for"))
      .filter(Boolean);
    // A different forged address every time, until the limit (10 a minute, one already spent above) answers 429.
    expect(forged.length).toBeGreaterThanOrEqual(10);
    expect(new Set(forged).size).toBe(forged.length);
  });
});
