/**
 * Read-only checks of a deployed trial (see scripts/verify-deploy.ts). They create no accounts: the sign-up probes
 * send a valid form without the invite code, so a working gate refuses them before anything is written.
 */
export type LiveCheck = { name: string; ok: boolean; skipped?: boolean; detail: string };

type Options = { fetch?: typeof fetch; probeId?: string; timeoutMs?: number };

const REQUIRED_HEADERS: Record<string, (value: string) => boolean> = {
  "x-content-type-options": (value) => value.toLowerCase() === "nosniff",
  "x-frame-options": (value) => value.toUpperCase() === "DENY",
  "referrer-policy": (value) => value.length > 0,
  "permissions-policy": (value) => value.length > 0
};
const ONE_YEAR = 31_536_000;

/** Payment and demo APIs, each with the method it implements (a GET to a POST-only route is 405 even when gated). */
const HIDDEN_APIS: Array<[method: string, path: string]> = [
  ["GET", "/api/billing"],
  ["POST", "/api/billing/payments"],
  ["POST", "/api/billing/usdt-intents"],
  ["GET", "/api/admin/payments"],
  ["GET", "/api/demo/story"]
];
const HIDDEN_PAGES = ["/fa/billing", "/en/billing", "/fa/demo", "/en/demo"];

/** Stack frames, server file paths and database errors that must never reach a client. */
const LEAK_PATTERNS = [
  /\bat [^\s(]+ \([^)]*:\d+:\d+\)/,
  /\n\s+at \S+/,
  /node_modules\//,
  /\/app\/(src|\.next|node_modules)\//,
  /\.next\/server\//,
  /PrismaClient\w*Error/,
  /ECONNREFUSED|password authentication failed/
];

// A not-found page streamed after the [locale] loading state keeps status 200 but carries this digest.
const STREAMED_NOT_FOUND = "NEXT_HTTP_ERROR_FALLBACK;404";
const LOGIN_LIMIT_PROBES = 12;

export async function runLiveChecks(baseUrl: string, options: Options = {}): Promise<LiveCheck[]> {
  const base = new URL(baseUrl);
  const fetchImpl = options.fetch ?? fetch;
  const probeId = options.probeId ?? Math.random().toString(36).slice(2, 10);
  const timeoutMs = options.timeoutMs ?? 20_000;
  const https = base.protocol === "https:";

  const request = (path: string | URL, init: RequestInit = {}) =>
    fetchImpl(new URL(path, base), { redirect: "manual", signal: AbortSignal.timeout(timeoutMs), ...init });
  const postJson = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    request(path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

  const checks: Array<[string, () => Promise<Omit<LiveCheck, "name">>]> = [
    [
      "health",
      async () => {
        const res = await request("/api/health");
        const body = await res.text();
        const ok = res.status === 200 && isHealthy(body);
        return { ok, detail: `${res.status} ${body.slice(0, 200)}` };
      }
    ],
    [
      "security headers",
      async () => {
        const problems: string[] = [];
        for (const path of ["/api/health", "/fa"]) {
          const res = await request(path);
          await res.body?.cancel();
          for (const [header, valid] of Object.entries(REQUIRED_HEADERS)) {
            const value = res.headers.get(header);
            if (!value || !valid(value)) problems.push(`${path}: ${header} ${value ?? "missing"}`);
          }
          if (https) {
            const hsts = res.headers.get("strict-transport-security");
            const maxAge = Number(/max-age=(\d+)/i.exec(hsts ?? "")?.[1] ?? 0);
            if (maxAge < ONE_YEAR) problems.push(`${path}: strict-transport-security ${hsts ?? "missing"}`);
          }
          if (res.headers.has("x-powered-by")) problems.push(`${path}: x-powered-by ${res.headers.get("x-powered-by")}`);
        }
        return { ok: problems.length === 0, detail: problems.join("; ") || (https ? "all present, HSTS >= 1 year" : "all present (HSTS not checked over http)") };
      }
    ],
    [
      "payment/demo APIs hidden",
      async () => {
        const seen: string[] = [];
        let ok = true;
        for (const [method, path] of HIDDEN_APIS) {
          const res = await request(path, method === "POST" ? { method, headers: { "content-type": "application/json" }, body: "{}" } : { method });
          await res.body?.cancel();
          if (res.status !== 404) ok = false;
          seen.push(`${method} ${path} ${res.status}`);
        }
        return { ok, detail: seen.join("; ") };
      }
    ],
    [
      "payment/demo pages hidden",
      async () => {
        const seen: string[] = [];
        let ok = true;
        for (const path of HIDDEN_PAGES) {
          const res = await request(path);
          const body = await res.text();
          const notFound = res.status === 404 || (res.status === 200 && body.includes(STREAMED_NOT_FOUND));
          if (!notFound) ok = false;
          seen.push(`${path} ${res.status}${notFound ? " not-found" : " RENDERED"}`);
        }
        return { ok, detail: seen.join("; ") };
      }
    ],
    [
      "sign-up needs the invite code",
      async () => {
        const seen: string[] = [];
        let ok = true;
        for (const [label, extra] of [
          ["no code", {}],
          ["wrong code", { inviteCode: `wrong-${probeId}` }]
        ] as const) {
          const email = `deploy-check-${probeId}-${label === "no code" ? "a" : "b"}@example.com`;
          const res = await postJson("/api/auth/register", { email, password: `DeployCheck-${probeId}-Aa1`, name: "Deploy check", ...extra });
          const body = await res.text();
          const refused = res.status === 403 && body.includes("INVITE_REQUIRED");
          if (!refused) ok = false;
          const hint =
            res.status === 201
              ? ` — an account ${email} was created; delete it and set REGISTRATION_INVITE_CODE`
              : body.includes("REGISTRATION_CLOSED")
                ? " — sign-up is closed for everyone: REGISTRATION_INVITE_CODE is not set"
                : "";
          seen.push(refused ? `${label}: 403 INVITE_REQUIRED` : `${label}: ${res.status} ${body.slice(0, 120)}${hint}`);
        }
        return { ok, detail: seen.join("; ") };
      }
    ],
    [
      "no stack traces in errors",
      async () => {
        const probes: Array<[string, () => Promise<Response>]> = [
          [`GET /api/missing-${probeId}`, () => request(`/api/missing-${probeId}`)],
          [`GET /fa/missing-${probeId}`, () => request(`/fa/missing-${probeId}`)],
          ["POST /api/auth/login (malformed JSON)", () => request("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: "{" })],
          ["GET /api/trades/<bogus id>", () => request(`/api/trades/missing-${probeId}`)]
        ];
        const seen: string[] = [];
        let ok = true;
        for (const [label, run] of probes) {
          const res = await run();
          const body = await res.text();
          const leak = LEAK_PATTERNS.find((pattern) => pattern.test(body));
          if (leak || res.status >= 500) ok = false;
          seen.push(`${label} ${res.status}${leak ? ` LEAKS ${leak}` : ""}`);
        }
        return { ok, detail: seen.join("; ") };
      }
    ],
    [
      "http redirects to https",
      async () => {
        if (!https) return { ok: true, skipped: true, detail: "base URL is http; nothing to check" };
        const seen: string[] = [];
        let ok = true;
        for (const path of ["/", "/api/health"]) {
          const res = await request(new URL(path, `http://${base.host}`));
          await res.body?.cancel();
          const location = res.headers.get("location") ?? "";
          const redirected = [301, 302, 307, 308].includes(res.status) && location.startsWith(`https://${base.host}`);
          if (!redirected) ok = false;
          seen.push(`http:/${path} ${res.status}${location ? ` -> ${location}` : ""}`);
        }
        return { ok, detail: seen.join("; ") };
      }
    ],
    [
      // Last: it spends this address's login allowance for a minute.
      "forged X-Forwarded-For cannot dodge the login limit",
      async () => {
        const statuses: number[] = [];
        for (let attempt = 1; attempt <= LOGIN_LIMIT_PROBES; attempt += 1) {
          const res = await postJson(
            "/api/auth/login",
            { email: `deploy-check-${probeId}@example.com`, password: "not-a-real-password" },
            { "x-forwarded-for": `198.51.100.${attempt}` }
          );
          await res.body?.cancel();
          statuses.push(res.status);
          if (res.status === 429) break;
        }
        const limited = statuses.includes(429);
        return {
          ok: limited,
          detail: `${statuses.join(",")}${
            limited
              ? " — limited (login from this address is blocked for about a minute). Confirm in the server log that 'rate limited: auth:login for <address>' names your own public IP"
              : " — never limited: the client IP comes from a forged header"
          }`
        };
      }
    ]
  ];

  const results: LiveCheck[] = [];
  for (const [name, run] of checks) {
    try {
      results.push({ name, ...(await run()) });
    } catch (error) {
      results.push({ name, ok: false, detail: error instanceof Error ? `${error.message}${error.cause instanceof Error ? ` (${error.cause.message})` : ""}` : String(error) });
    }
  }
  return results;
}

function isHealthy(body: string) {
  try {
    const parsed = JSON.parse(body) as { status?: unknown; database?: unknown };
    return parsed.status === "ok" && parsed.database === "ok";
  } catch {
    return false;
  }
}
