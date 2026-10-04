# Nazm architecture

Nazm is one Next.js application (App Router) on top of a PostgreSQL database. It is a trading journal and discipline
tool in Persian (right to left, the primary language) and English: it plans, records and reviews trades. It does not
place orders, connect to a broker or give signals, and tests keep it that way.

**Stack:** Next.js 16 and React 19, TypeScript, Tailwind 3, Prisma 7 with the `pg` driver, PostgreSQL, zod 4. Redis is
optional. Tests run on Vitest (with Testing Library) and Playwright.

## Repository layout

| Path | What lives there |
| --- | --- |
| `src/app` | Routes. `src/app/[locale]` holds the pages, one folder per screen, under the language prefix. `src/app/api` holds the HTTP API, one `route.ts` per route (see `docs/API.md`). `src/app/offline` is the offline page |
| `src/proxy.ts` | The request proxy: sends a page URL without a language prefix to `/fa` or `/en` |
| `src/components` | `layout` (app shell, navigation, page header), `ui` (buttons, cards, tables, charts, empty and error states), `pwa` (service worker registration, install prompt) |
| `src/features` | The screens' own components, one folder per area (listed below) |
| `src/lib` | Everything that is not a component: services, calculations, parsers, security (listed below) |
| `src/messages` | `en.json` and `fa.json`, the shared interface strings |
| `prisma` | `schema.prisma`, the migrations in `prisma/migrations`, and `seed.ts` |
| `tests` | `unit` (Vitest, including component tests), `api` (route contract tests), `e2e` (Playwright) and `fixtures` |
| `scripts` | The container entry point and health check, `verify-deploy.ts`, the database check, the operator password reset (`reset-password.ts`) and one-off data repairs |
| `public` | The Persian font, icons, and the service worker `sw.js` |
| `docs` | These documents, and sample import files in `docs/samples` |

### `src/features`

| Folder | Screens |
| --- | --- |
| `access` | The request-access form |
| `admin` | The admin screen and the list of access requests |
| `ai` | The coach |
| `alerts` | Alerts |
| `auth` | The sign-in and sign-up panel |
| `backtesting` | The scenario simulator |
| `billing` | Plans and payment pages, hidden unless payments are on |
| `dashboard` | Home: readiness, the setup card and the discipline streak |
| `demo` | The demo walkthrough, shown in demo mode only |
| `growth` | Long-term progress |
| `ideas` | Ideas |
| `import` | Importing an MT5 report or a CSV file |
| `journal` | The journal and the trade review editor |
| `landing` | The public landing page |
| `learning` | The glossary and learning templates |
| `news` | News and context |
| `onboarding` | The first-run questions and the setup checklist |
| `performance` | Performance analytics |
| `portfolio` | Capital: portfolios and holdings kept by hand |
| `reviews` | Daily, weekly and other reviews |
| `risk` | The risk desk, the position planner and plan sizing |
| `sample` | The sample-data banner and offer |
| `settings` | Settings, password change, data export and account deletion |
| `strategy` | Strategies and playbooks |
| `trade-plans` | Plans, with warnings when a plan breaks a strategy's limits |
| `watchlists` | Watchlists |

### `src/lib`

| Folder | What it holds |
| --- | --- |
| `ai` | The coach's guard: refuses requests for signals or advice and checks provider output |
| `api` | Route helpers (`ok`, `fail`, `readJson`, `routeHandler`, the error classes) and the browser-side `apiFetch` |
| `attachments` | Checks and downscaling for screenshots attached to a trade |
| `auth` | The session cookie, the current user, roles, the sign-up mode and the admin bootstrap |
| `billing` | The payments flag, plans and prices, and the payment rules |
| `cache` | A small key-value store with expiry, on Redis or in memory |
| `calculations` | Pure functions: risk, position and plan sizing, journal metrics, ladders, discipline, readiness, playbook adherence, backtests |
| `db` | The Prisma client and database error helpers |
| `demo` | The scripted story of the demo walkthrough |
| `deploy` | The checks behind `npm run verify:deploy` |
| `i18n` | Languages, message lookup, number and date formatting, fallback copy |
| `import` | The CSV parser, the MT5 report parser and MT5 broker-time handling |
| `observability` | Daily counters for outside provider calls, errors and fallbacks |
| `onboarding` | First-run state and the questions' segments |
| `privacy` | The inventory of stored data that Settings shows |
| `providers` | `fetchJson`, a JSON request with a timeout, used by the HTTP providers |
| `release` | A pure release-readiness check (privacy, account deletion, export and coach guard), used by tests |
| `sample` | The builder of the sample workspace |
| `security` | Password hashing, signed tokens, TOTP, rate limits, the client address and the audit log |
| `services` | One file per area: the Prisma queries and the orchestration behind each route |
| `text` | Small text helpers |
| `time` | Time zones and local date-times |
| `validation` | The zod schema of every request body |

`src/lib/env.ts` reads the environment, and `src/lib/entitlements.ts` maps a plan to its limits and features.

## Request flow

An API call passes through the same steps in every route handler:

1. The handler in `src/app/api/<area>/route.ts` runs inside `routeHandler` (`src/lib/api/response.ts`), which turns a
   thrown `AppError` or zod error into the `{ error: { code, message } }` answer.
2. `enforceRateLimit` counts the request against the client address (below).
3. `requireUser()` or `requireAdminUser()` reads the session.
4. `readJson(request, schema)` parses the body with the zod schema from `src/lib/validation`. Any content type other
   than JSON is refused.
5. A function in `src/lib/services` does the work: Prisma queries scoped to the signed-in user, plus the pure functions
   in `src/lib/calculations`.
6. Changes are written to the audit log and the handler answers `ok(data)`, which is `{ data }`.

Pages are React Server Components that render the shell and, for most screens, a client component from
`src/features` that calls the same routes with `apiFetch`.

## Data

PostgreSQL, through Prisma. `prisma/schema.prisma` is the schema; every change is a migration in `prisma/migrations`
that is applied with `prisma migrate deploy`. The container applies pending migrations when it starts
(`scripts/docker-entrypoint.sh`) and stops if one fails. The models, by area:

- Accounts and access: `User`, `Session`, `PasswordResetToken`, `Role`, `Permission`, `UserRole`, `RolePermission`,
  `AccessRequest`, `AuditLog`, `AppSetting`, `FeatureFlag`, and `OAuthAccount` (in the schema, but nothing uses it yet:
  there is no OAuth sign-in).
- Trades and journal: `Trade`, `TradeJournalEntry`, `TradeImport`, `TradeImportRow`, `TradePlan`, `TradingSession`,
  `MistakeTag`, `EmotionTag`, `UploadedFile`.
- Strategies and review: `Strategy`, `StrategyVersion`, `Review`, `Idea`, `Backtest`, `PerformanceSummary`,
  `RiskProfile`.
- Markets and context: `Asset`, `Watchlist`, `WatchlistItem`, `SymbolNote`, `Portfolio`, `PortfolioHolding`,
  `PortfolioTransaction`, `NewsItem`, `NewsAnalysis`, `MarketContext`.
- Coach, learning and alerts: `AiReview`, `LearningGlossary`, `LearningTemplate`, `Alert`, `Notification`.
- First run and billing: `OnboardingProfile`, `Payment`.

Reviews are the `Review` model. A review has a type (daily, weekly, mistake, risk or strategy), a checklist, and the
lessons and next actions the person writes; `src/lib/services/reviews.ts` drafts the checklist and the summaries from
the journal, the risk defaults and the strategies, and can create a reminder `Alert`.

Rows made by the sample workspace carry an `isSample` flag so they can be removed without touching real data.

## Importing trades

Both file types end in the same endpoint, `POST /api/trades/import`.

- A **CSV file** is sent as text with a column mapping. The server validates every row with the trade schema, skips a
  position it already has (its `externalId`), and stores the upload as a `TradeImport` with one `TradeImportRow` per
  line, so a preview shows what would happen before anything is saved.
- An **MT5 report** is converted in the browser. `src/lib/import/mt5-report.ts` decodes the UTF-16 HTML file, reads the
  Positions table, writes one CSV row per position, and tags the legs of a numbered ladder with a shared key. The import
  screen then sends that CSV with a column mapping and the broker's time zone. The server never receives the report
  itself. Ladder legs stay separate rows and are grouped into one entry when metrics are calculated
  (`src/lib/calculations/ladders.ts`).

## Sessions and security

- **Sessions.** Signing in creates a random token. The database stores only its SHA-256 hash (`Session`); the browser
  gets the token in the `nazm_session` cookie, signed with `SESSION_SECRET`, httpOnly, SameSite=Lax, Secure in
  production, valid for 30 days. Passwords are hashed with bcrypt. Two-factor sign-in (TOTP) is optional per account.
- **Roles.** An account made by sign-up is a `trader`; the `admin` role is attached at sign-in for the e-mails in
  `ADMIN_EMAILS`.
- **Sign-up** is invite-only while `REGISTRATION_INVITE_CODE` is set. Without a code it is open outside production and
  closed in production unless `REGISTRATION_OPEN=true`.
- **Rate limits.** `enforceRateLimit` keeps a counter per route and client address, in Redis when `REDIS_URL` is set
  and in the memory of the server process otherwise (or when Redis cannot be reached). The address is the entry of
  `X-Forwarded-For` that the nearest trusted proxy added (`TRUSTED_PROXY_HOPS`, default 1), so the app is meant to run
  behind a reverse proxy.
- **Other protections.** Every route validates its input with zod, bodies must be JSON, security headers are set in
  `next.config.ts` (HSTS in production), and writes go to the audit log.
- **Privacy.** Settings lists what is stored (`src/lib/privacy`), exports it as one JSON file, and deletes the account
  and its data.

## Providers

Outside services sit behind a small interface with a local implementation that needs no key, so Nazm runs fully
offline by default.

- **Coach.** `getAiProvider()` in `src/lib/services/ai.ts` returns the rule-based local provider, or the OpenAI-compatible
  provider when `AI_PROVIDER=openai` and `OPENAI_API_KEY` are set (`OPENAI_BASE_URL` points it at another compatible
  server). The outside provider's answers are checked, cached for an hour and limited per user per day
  (`AI_DAILY_CALL_CAP`); on a failure, an answer that does not pass the check, or a day over the cap, the local
  provider answers instead. A trade-review request that asks for a signal or advice is refused before any provider call.
- **News.** News items stored in the database come first. After those, `NEWS_PROVIDER=http` reads a feed from
  `NEWS_API_URL`; otherwise, and whenever the feed fails, the built-in samples are used.
- **Alert notifications.** In-app, webhook, Telegram and Discord channels. E-mail is not implemented: it only logs.

## Languages

Persian (`fa`) is the primary language and is laid out right to left (RTL); English (`en`) is the second and reads left
to right. The language is the first segment of the URL, and the root layout writes `lang` and `dir` on the page. A bare URL goes to the language
saved in the `locale` cookie, else Persian. Interface strings live in `src/messages/en.json` and `fa.json` (a test keeps
their keys equal) and in `copy = { en, fa }` objects next to the components that use them. Text the server writes, such
as reviews, coach answers and the sample workspace, is produced in the requested or the account's saved language. The
Persian font, Vazirmatn, is served from `public/fonts`.

## Payments and demo mode

Payments are optional and off by default. `src/lib/billing/enabled.ts` decides: they are on outside production, and in
production only when `NEXT_PUBLIC_PAYMENTS_ENABLED=true` was set when the app was built (`NEXT_PUBLIC_*` values are
compiled into the build, so the Docker image takes them as build arguments). While they are off, the billing pages and
routes answer 404, the menu hides them and the privacy inventory leaves out payment records. A purchase is a transfer
that an admin reviews by hand; no payment processor is connected. Plans (`free`, `pro`, `elite`) set limits and
features in `src/lib/entitlements.ts`. Demo mode follows the same rule with `NEXT_PUBLIC_DEMO_MODE`.

## First run and sample data

A new account answers two short questions (`src/features/onboarding`, `src/lib/onboarding`) that send it to the screen
to start with (a trader who uses MT5 reaches the import in a few clicks); every step can be skipped. An account with no trades can load a labelled month of sample
data (`src/lib/sample`, `src/lib/services/sample-workspace.ts`), and the first real trade or import removes it.

## Running it

The `Dockerfile` builds the app in stages (Node 24) and starts it with `scripts/docker-entrypoint.sh`, which runs
`npm run prisma:deploy` (that is `prisma migrate deploy`) and then `next start`. `docker-compose.yml` is a local stack
with the app, PostgreSQL and Redis; its database password is public and its sign-up is open, so it is not for a
server. `npm run verify:deploy` checks a running server from the outside. The service worker `public/sw.js` caches the
offline page and static files; it never caches API answers.
