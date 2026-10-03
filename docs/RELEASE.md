# Nazm — Release Evidence & Hardening

> Status: **release candidate**. This file is the release checklist + store/packaging metadata. It is
> written evidence; it does not by itself ship anything. Programmatic readiness is computed by
> `src/lib/release/readiness.ts` (`buildReleaseReadiness`) — blocking safety gates vs. advisory
> store-release items.

## 1. Product identity

- **Name:** Nazm — the trader's discipline journal (Persian: نظم)
- **One-liner (EN):** Plan, journal, review, and improve your trading discipline.
- **One-liner (FA):** پلن، ژورنال، مرور و بهبود انضباط معاملاتی.
- **What it is:** a bilingual (EN/FA, RTL) **review-and-discipline** journal. It helps a trader plan
  setups, log trades, review adherence, and learn from mistakes.
- **What it is NOT (enforced in product + copy):** not a broker, not a financial advisor, not a
  source of entry/exit calls. The AI coach refuses entry-call requests before any provider call
  (`src/lib/ai/guard.ts`). Scope is guarded by `tests/unit/product-scope.test.ts`.

## 2. Privacy & data

- **Data inventory:** declared in `src/lib/privacy/data-inventory.ts` (`DATA_CATEGORIES`) — account,
  onboarding profile, risk profile, playbooks, plans, imports, trades, journal, reviews, ideas,
  sessions, watchlists, portfolios, alerts, backtests, uploads, AI audit log, security audit log, and
  sign-in sessions.
- **Export:** users download all their own data as JSON via `GET /api/users/me/export`
  (Settings → Data & Privacy). `exportableCategories()` defines coverage (AI audit log is internal,
  not exported).
- **Privacy policy URL:** localized routes exist at `/en/privacy` and `/fa/privacy`; the production
  store URL should point at the deployed `/en/privacy` route unless a separate legal site is used.
- **Transparency:** Settings → Data & Privacy lists every category with an in-export/internal badge
  (`GET /api/privacy/inventory`).
- **Account deletion:** the read-only **preview** (`buildDeletionPreview`) lists what would be removed
  and is irreversible (`reversible: false`). The executing mutation is now built as
  `DELETE /api/users/me`: it requires the signed-in user's password, matching account email, and the
  literal `DELETE` confirmation phrase; it clears the session cookie after deletion. User-scoped audit
  logs are deleted before the account row, then an anonymous completion audit is kept without email or
  user id.
- **Password change:** `POST /api/users/me/password` (Settings, Password card): needs the current password; one
  transaction stores the new hash, signs out every other device, keeps this one signed in and uses up open reset
  tokens; limited per address and per account.
- **Retention:** no third-party data sale; AI provider calls are gated + cached; missing AI config
  falls back to the local coach (no external call).

## 3. PWA (advisory)

Ship a web app manifest + icons before store packaging:
- `manifest.webmanifest`: `name`, `short_name` ("Nazm"), `description`, `start_url` `/`,
  `display: standalone`, `theme_color`/`background_color` (dark), `lang` per locale, `dir: rtl` for FA.
- Icons: PNG binaries are present at `public/icons/icon-192.png`, `icon-256.png`, `icon-384.png`,
  `icon-512.png`, and `icon-512-maskable.png` (SVG sources remain for reference).
- Offline scope: read-only views degrade gracefully (the cockpit + settings already tolerate fetch
  failure); no offline mutations.

## 4. TWA packaging (advisory, Android)

Wrap the PWA as a Trusted Web Activity:
1. Confirm a passing Lighthouse PWA installability check.
2. `npx @bubblewrap/cli init --manifest https://<host>/manifest.webmanifest`.
3. Set `applicationId` (e.g. `app.nazm.journal`), version code/name, and signing key.
4. Publish `/.well-known/assetlinks.json` (Digital Asset Links) so the TWA opens without a URL bar.
5. `bubblewrap build` → signed `.aab` for Play Console.

## 5. Store metadata (advisory)

- **Title:** Nazm: Discipline Journal
- **Short description:** Plan, journal, and review your trades. Build discipline — no signals, no
  advice.
- **Full description:** review-focused only; describe planning, journaling, adherence, risk
  calculators, learning mode. **Do not** mention entry/exit calls, guaranteed returns, or copy/social
  trading (product-scope guard forbids these terms).
- **Category:** Finance / Education. **Content rating:** everyone. **Privacy policy URL:** required.

## 6. Release readiness gates

Mapped to `buildReleaseReadiness` — **READY** requires all blocking gates:

| Gate | Type | Status |
| --- | --- | --- |
| Privacy policy | blocking | **done** (`/[locale]/privacy`; deploy URL for stores) |
| Account deletion path | blocking | **done** (`DELETE /api/users/me`, gated by password/email/DELETE) |
| Data export | blocking | **done** (`/api/users/me/export`) |
| AI refusal guard | blocking | **done** (`guard.ts`, tested) |
| PWA manifest + assets | advisory | **done** (`app/manifest.ts` + PNG icon binaries) |
| TWA packaging docs | advisory | **this file** |
| Store metadata | advisory | drafted above |

Current code-level verdict: **READY** for blocking release gates. Store submission still requires the
deployed public privacy-policy URL, production hosting, signing assets, and normal store-console setup.

## 7. Release evidence trail

- Tests: `npm run typecheck && npm run lint && npm run test` (+ `npm run build` before tagging).
- Safety scope: `tests/unit/product-scope.test.ts` + `src/lib/ai/guard.ts` refusal tests.
