/**
 * Check a deployed trial from outside: health, security headers, payments/demo hidden, invite-only sign-up, error
 * pages, http -> https, and that a forged X-Forwarded-For cannot dodge the login limit. Meant for an invite-only
 * instance: it creates no accounts there (with REGISTRATION_OPEN=true its sign-up check fails and creates one). Needs no secrets; the last check blocks login from this address for about a minute.
 *
 *   npm run verify:deploy -- https://your-host.example
 */
import { runLiveChecks } from "@/lib/deploy/live-checks";

const baseUrl = process.argv[2] ?? process.env.APP_URL;
if (!baseUrl) {
  console.error("Usage: npm run verify:deploy -- <https://your-app-url>");
  process.exit(2);
}

const checks = await runLiveChecks(baseUrl);
for (const check of checks) {
  const mark = check.skipped ? "SKIP" : check.ok ? "PASS" : "FAIL";
  console.log(`${mark}  ${check.name}\n      ${check.detail}`);
}
const failures = checks.filter((check) => !check.ok).length;
console.log(failures ? `\n${failures} check(s) failed.` : `\nAll checks passed for ${baseUrl}.`);
process.exit(failures ? 1 : 0);
