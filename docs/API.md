# Nazm API

The HTTP API behind the web app. Every route is a Next.js route handler under `src/app/api`, and this page lists all
of them. Request bodies are the zod schemas in `src/lib/validation`; each route's file shows which one it uses.

The API is the one the web screens call. It is not versioned: while the version is 0.x it can change in a minor
release (see `CHANGELOG.md`).

## How to call the API

**Bodies are JSON.** A `POST` or `PATCH` body must be sent as `Content-Type: application/json`; any other content type
is refused with 415 `UNSUPPORTED_MEDIA_TYPE`. An empty body reads as `{}`.

**Sign in once, then send the cookie.** `POST /api/auth/login` with `{ "email": "...", "password": "..." }` sets the
`nazm_session` cookie (httpOnly, SameSite=Lax, Secure in production, valid for 30 days). Every route marked `session`
below reads it, so a script keeps a cookie jar the way a browser does.

```bash
curl -s -c cookies.txt -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"your-password"}' \
  http://localhost:3000/api/auth/login

curl -s -b cookies.txt http://localhost:3000/api/trades/metrics
```

A route marked `admin` also needs the `admin` role. A route marked `public` needs no sign-in.

**Two-factor sign-in.** When the account has two-factor on, a login without a valid `totpCode` (the six digits from
the authenticator app) answers 401 `TWO_FACTOR_REQUIRED`; send the same request again with `totpCode`. To turn it on,
call `POST /api/auth/2fa/setup` (it returns a `secret` and an `otpAuthUrl` for the app), then
`POST /api/auth/2fa/verify` with the first `code`. `POST /api/auth/2fa/disable` needs a current `code`. The web app has
no screen for this; it is done through these routes.

**Answers.** Success is `{ "data": ... }`, and a created record answers 201:

```json
{ "data": {} }
```

Failure is an `error` with a stable `code`, a human-readable `message` and, for validation, the field `details`:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Request validation failed", "details": {} } }
```

Two routes answer differently: `GET /api/health` returns `{ "status": "ok", "database": "ok" }` (503 with
`"degraded"` and `"unreachable"` when the database does not answer), and `GET /api/users/me/export` returns the
export file itself, not wrapped in `data`.

**Updating and deleting.** The list routes (`/api/trades`, `/api/trade-plans`, `/api/strategies`, `/api/reviews`,
`/api/alerts`, `/api/watchlists`, `/api/ideas`, `/api/portfolios`) work on one record by its id: `PATCH` takes the
record's `id` in the body together with the fields to change, and `DELETE` takes the id as `?id=...` or as
`{ "id": "..." }` in the body. A route with `:id` in its path takes the id from the path instead.
`PATCH /api/users/me/settings`, `DELETE /api/users/me` and `DELETE /api/sample-workspace` act on the signed-in account
and take no id.

**Language.** Routes that write text for a screen (reviews, the coach, the dashboard summary) take a `locale`
(`en` or `fa`) in the body or query string. The onboarding routes call it `language`: `?language=` on
`GET /api/onboarding/plan` and `language` in the body of `POST /api/onboarding/sprint`. Without one, the language saved
in the account's settings is used (the sign-up form saves the page language; an account created without one is English).

**Rate limits.** Most routes that sign people in, write data, import or call the coach are limited per client address
and per route, and a request over the limit answers 429 `RATE_LIMITED`. For example sign-in allows 10 attempts a minute
and sign-up 5. The counters live in Redis when `REDIS_URL` is set and in the server's memory otherwise. The client address
is read from `X-Forwarded-For` as your reverse proxy sets it (`TRUSTED_PROXY_HOPS`), so run the app behind one.

## Errors

| Status | Code | When |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | The route needs a session and the request has none |
| 401 | `INVALID_CREDENTIALS` | Wrong e-mail or password at sign-in |
| 401 | `TWO_FACTOR_REQUIRED` | Two-factor is on and `totpCode` is missing or wrong |
| 403 | `FORBIDDEN` | The signed-in user lacks the role the route needs |
| 403 | `INVITE_REQUIRED` | Sign-up needs an invite code and the one sent is missing or wrong |
| 403 | `REGISTRATION_CLOSED` | Sign-up is closed on this server |
| 404 | `NOT_FOUND` | No such record (or no such route while payments or demo mode are off) |
| 409 | `EMAIL_ALREADY_EXISTS` | The e-mail cannot be registered |
| 413 | `PAYLOAD_TOO_LARGE` | The body is bigger than the route accepts |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | The body is not sent as `application/json` |
| 422 | `VALIDATION_ERROR` | The body or query failed its schema; `details` lists the fields |
| 429 | `RATE_LIMITED` | Too many requests from this address |
| 500 | `INTERNAL_SERVER_ERROR` | Anything unexpected; the cause is only in the server log |

Some routes add codes of their own (for example `INVALID_RESET_TOKEN`, `INVALID_TOTP_CODE`,
`PASSWORD_CHANGE_CURRENT_INVALID`); they are named in the route's file.

## Routes

`:id` is the record's id. "Access" is `public`, `session` or `admin`, as described above.

### Auth

| Method | Path | Access | What it does |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | public | Create an account and sign in. Needs `inviteCode` while `REGISTRATION_INVITE_CODE` is set; in production sign-up is closed unless a code is set or `REGISTRATION_OPEN=true` |
| POST | `/api/auth/login` | public | Sign in with e-mail and password (and `totpCode` when two-factor is on); sets the session cookie |
| POST | `/api/auth/logout` | public | End the current session and clear the cookie |
| GET | `/api/auth/me` | public | The signed-in user, or `user: null` when there is no session |
| POST | `/api/auth/password-reset/request` | public | Create a one-hour reset token for an e-mail. Nothing is e-mailed: the token is returned as `devToken` outside production only, and in production the answer is the same whether or not the account exists |
| POST | `/api/auth/password-reset/confirm` | public | Set a new password with a reset token and sign the account out everywhere |
| POST | `/api/auth/2fa/setup` | session | Start two-factor setup: returns a secret and an `otpauth` URL, and leaves two-factor off until it is verified. While it is on, a current `code` is needed to start again |
| POST | `/api/auth/2fa/verify` | session | Turn two-factor on with a code from the authenticator app |
| POST | `/api/auth/2fa/disable` | session | Turn two-factor off; needs a current `code` |

### Account and settings

| Method | Path | Access | What it does |
| --- | --- | --- | --- |
| GET, PATCH | `/api/users/me/settings` | session | Read or change language, theme, time zone, risk defaults, starting balance and the broker time zone |
| POST | `/api/users/me/password` | session | Change the password (needs the current one); signs out the other devices and keeps this one |
| GET | `/api/users/me/export` | session | Download everything the account holds as one JSON file |
| DELETE | `/api/users/me` | session | Delete the account and its data; needs the password, the account's e-mail and the text `DELETE` |
| GET | `/api/privacy/inventory` | session | The categories of data the app stores and which of them an export covers |

### Trades and import

| Method | Path | Access | What it does |
| --- | --- | --- | --- |
| GET, POST, PATCH, DELETE | `/api/trades` | session | List, record, edit or delete trades with their journal fields; the first trade of your own removes the sample data |
| POST | `/api/trades/import` | session | Import trades from CSV (preview first with `previewOnly`); see [Import](#import) |
| GET | `/api/trades/metrics` | session | Figures over the closed trades: win rate, net result, average R, profit factor, expectancy, drawdown, the equity curve and results per setup |

### Plans and trading sessions

A trading session is a working session with its own plan (market, label, the day's loss limit, allowed strategies).
It is not a sign-in session.

| Method | Path | Access | What it does |
| --- | --- | --- | --- |
| GET, POST, PATCH, DELETE | `/api/trade-plans` | session | List, create, edit or delete trade plans, optionally linked to a strategy |
| POST | `/api/trade-plans/:id/convert` | session | Turn a plan into a trade from the entry details sent |
| GET, POST | `/api/sessions` | session | List recent trading sessions, or start one (any session still active is marked abandoned) |
| GET | `/api/sessions/active` | session | The trading session that is active now, or `null` |
| PATCH | `/api/sessions/:id` | session | End a trading session and add closing notes |

### Strategies and playbooks

| Method | Path | Access | What it does |
| --- | --- | --- | --- |
| GET, POST, PATCH, DELETE | `/api/strategies` | session | List, create, edit or delete strategies (entry, exit, invalidation and risk rules) |
| GET | `/api/strategies/:id/performance` | session | Results of the trades and backtests tied to one strategy |
| GET | `/api/playbooks/adherence` | session | How often each playbook's rules were followed |

### Reviews

| Method | Path | Access | What it does |
| --- | --- | --- | --- |
| GET, POST, PATCH, DELETE | `/api/reviews` | session | List reviews (filter with `?type=` and `?status=`) with the current review focus; create, update (check items off, carry actions forward) or delete one |
| POST | `/api/reviews/generate` | session | Draft a daily, weekly, mistake, risk or strategy review from the journal; optionally add a reminder |
| POST | `/api/reviews/:id/reminder` | session | Add a reminder alert for a review |

### Risk calculators

Stateless planning maths. They store nothing and place nothing.

| Method | Path | Access | What it does |
| --- | --- | --- | --- |
| POST | `/api/risk/position-size` | public | Position size from balance, risk percent, entry and stop |
| POST | `/api/risk/forex-lot-size` | public | Lot size from balance, risk percent and a stop in pips |
| POST | `/api/risk/liquidation` | public | Estimated liquidation price for a leveraged position |
| POST | `/api/risk/calculators` | public | Run several of the above, plus reward-to-risk and stop distance, in one request |

### Dashboard and analytics

| Method | Path | Access | What it does |
| --- | --- | --- | --- |
| GET | `/api/dashboard/overview` | session | What the home screen shows: readiness, metrics, open plans, review focus and a short summary |
| GET | `/api/discipline` | session | The discipline score, the prop-firm guard check, repeated-mistake patterns and the week's rule adherence |
| GET | `/api/discipline/streak` | session | The streak of days that followed the rules |
| GET | `/api/mentor-report` | session | A report meant for sharing with a mentor; `?hidePnl=true` leaves out money figures. While payments are on it needs the Elite plan |
| GET, POST | `/api/backtests` | session | List saved backtests, or calculate and save one from a list of trades you send |

### Coach

The coach is rule-based and runs on the server. It uses an outside provider only when `AI_PROVIDER=openai` and a key
are set. It does not give signals or advice: such a request is refused before any provider call.

| Method | Path | Access | What it does |
| --- | --- | --- | --- |
| POST | `/api/ai/review-trade` | session | Review one trade's details as process questions; answers `refused: true` for a request for a signal or advice |
| POST | `/api/ai/journal-insights` | session | Patterns across the journal |
| POST | `/api/ai/weekly-review` | session | A review of the week |
| POST | `/api/ai/strategy-review` | session | Review questions about a strategy (`strategyId` is optional) |
| POST | `/api/ai/news-summary` | session | News turned into caution notes and review questions |

### Alerts

| Method | Path | Access | What it does |
| --- | --- | --- | --- |
| GET, POST, PATCH, DELETE | `/api/alerts` | session | List, create, edit or delete alerts and their notification channels |
| POST | `/api/alerts/:id/test-notify` | session | Send a test message through an alert's channels |

### Watchlists, ideas and portfolios

| Method | Path | Access | What it does |
| --- | --- | --- | --- |
| GET, POST, PATCH, DELETE | `/api/watchlists` | session | List, create, edit or delete watchlists and their symbols |
| GET, POST, PATCH, DELETE | `/api/ideas` | session | List (filter with `?query=`, `?status=`, `?market=`, `?type=`), create, edit or delete ideas |
| GET, POST, PATCH, DELETE | `/api/portfolios` | session | List, create, edit or delete portfolios |
| POST | `/api/portfolios/:id/transactions` | session | Record a buy or sell in a portfolio by hand; nothing is sent to a broker or exchange |

### News and learning

| Method | Path | Access | What it does |
| --- | --- | --- | --- |
| GET | `/api/news` | public | Recent news items in `?locale=` (`en` by default): stored ones, else the configured news provider's (built-in samples by default) |
| POST | `/api/news/analyze` | session | Turn a news item or pasted text into a caution note and a review checklist |
| GET | `/api/learning/glossary` | public | The glossary and the learning templates in `?locale=` (`en` by default) |

### Sample data and onboarding

| Method | Path | Access | What it does |
| --- | --- | --- | --- |
| GET, POST, DELETE | `/api/sample-workspace` | session | Whether sample data is loaded; load one labelled month into an account with no trades; remove it |
| GET, POST | `/api/onboarding/state` | session | Where the account stands in the first-run screens; save an answer or mark the first run done |
| GET, POST | `/api/onboarding/sprint` | session | Read or save the profile and starter discipline sprint built from the first-run answers |
| GET | `/api/onboarding/plan` | session | A starter plan from `?experience=`, `?market=` and `?disciplineIssue=`; saves nothing |

### Access requests

| Method | Path | Access | What it does |
| --- | --- | --- | --- |
| POST | `/api/access-requests` | public | Ask the server's administrator for an invite; every valid request gets the same answer |

### Admin

| Method | Path | Access | What it does |
| --- | --- | --- | --- |
| GET | `/api/admin/overview` | admin | Counts, recent audit entries, feature flags and provider activity |
| GET | `/api/admin/access-requests` | admin | List access requests (filter with `?status=`) |
| PATCH, DELETE | `/api/admin/access-requests/:id` | admin | Mark a request invited, declined or new again; or delete it |

### System

| Method | Path | Access | What it does |
| --- | --- | --- | --- |
| GET | `/api/health` | public | Liveness for a health check: the app answers, and says whether the database does |
| GET | `/api/system/options` | public | The supported markets, risk presets and which providers are configured |

### Billing and payments (off unless `NEXT_PUBLIC_PAYMENTS_ENABLED`)

Plan purchases by manual-review transfer. They are on outside production. In a production build they answer 404
`NOT_FOUND` unless `NEXT_PUBLIC_PAYMENTS_ENABLED=true` was set when the app was built.

| Method | Path | Access | What it does |
| --- | --- | --- | --- |
| GET | `/api/billing` | session | The account's plan, the prices, the open transfer methods and the account's own submissions |
| POST | `/api/billing/payments` | session | Submit a transfer for review |
| POST | `/api/billing/usdt-intents` | session | Reserve an exact amount for a transfer for 48 hours |
| GET | `/api/admin/payments` | admin | List submitted transfers (filter with `?status=`) |
| POST | `/api/admin/payments/:id` | admin | Approve, reject or refund one transfer |

### Demo (demo builds only)

On outside production. In a production build it answers 404 `NOT_FOUND` unless `NEXT_PUBLIC_DEMO_MODE=true` was set
when the app was built.

| Method | Path | Access | What it does |
| --- | --- | --- | --- |
| GET | `/api/demo/story` | session | The scripted two-week story the demo walkthrough shows |

## Import

`POST /api/trades/import` reads a CSV, validates every row and, unless `previewOnly` is true, saves the valid ones.

```json
{
  "filename": "my-trades.csv",
  "previewOnly": true,
  "timeZone": "Europe/Helsinki",
  "mapping": {
    "symbol": "symbol",
    "market": "market",
    "side": "side",
    "status": "status",
    "entryPrice": "entryPrice",
    "exitPrice": "exitPrice",
    "stopLoss": "stopLoss",
    "takeProfit": "takeProfit",
    "quantity": "quantity",
    "fees": "fees",
    "openedAt": "openedAt",
    "closedAt": "closedAt"
  },
  "csv": "symbol,market,side,status,entryPrice,exitPrice,stopLoss,takeProfit,quantity,fees,openedAt,closedAt\nBTCUSDT,crypto,long,closed,100,110,95,120,1,1,2026-06-10T00:00:00.000Z,2026-06-10T02:00:00.000Z"
}
```

- `csv` is required (up to 500,000 characters). `side` is `long` or `short`, `market` is `crypto`, `forex` or `stocks`,
  `status` is `open`, `closed`, `planned` or `canceled`, and times are ISO 8601.
- `mapping` says which CSV column feeds which field, as `{ "field": "column name" }`. Only the fields it names are
  read. Without `mapping`, the server reads these 11 fields, each from the column of the same name: `symbol`, `market`,
  `side`, `entryPrice`, `exitPrice`, `stopLoss`, `takeProfit`, `quantity`, `fees`, `openedAt` and `closedAt`. `status`
  is not one of them, so a trade with no mapped `status` is stored as `open` whatever the file says. A file with a
  `status`, `externalId` or journal column (`session`, `setupType`, `emotionalState`, `mistakes`, `tags`, `notes`, as in
  `docs/samples/trades-sample.csv`) needs a `mapping` that names it; the Import screen builds one from the file's
  headers. `mistakes` and `tags` hold several values separated by `|`.
- A row whose mapped `externalId` was imported before is skipped and counted in `duplicates`; rows without one are
  always added.
- `timeZone` is applied to open and close times that carry no zone, such as an MT5 report's broker server time. It is
  an IANA zone such as `Europe/London`, or `mt5:new-york-close`, the common broker convention (New York time plus
  seven hours). For an MT5 report the web app sends the broker time zone from Settings.
- The answer has `importId`, `preview` (one entry per row with `rowNumber`, `isValid`, `duplicate`, `errors` and the
  mapped values), the counts `imported`, `duplicates`, `validRows` and `invalidRows`, the saved `trades`, and
  `sampleRemoved` (true when the first imported trade replaced the sample data).

**The MT5 report is converted in the browser.** MetaTrader 5 exports History > Report as an HTML file (UTF-16) or an
XLSX file, never CSV. The Import screen reads the HTML report as it is (an XLSX report has to be saved as CSV first),
takes the Positions table (`src/lib/import/mt5-report.ts`) and turns it into a CSV with a fixed set of columns that
includes `status`, `realizedPnl` and `externalId`. It then sends that CSV to `POST /api/trades/import` together with a
`mapping` that names each of those columns after itself (`MT5_IMPORT_MAPPING` in the same file) and the broker
`timeZone`. The server never receives the HTML report. A script that sends such a CSV has to send the same `mapping`:
without it the rows are read as `open` trades with no `externalId` and no `realizedPnl`, and an overlapping report
imported twice adds every position twice. With it, a position whose `externalId` was imported before is skipped and
counted in `duplicates`. A sample MT5 report is in `docs/samples/mt5-report-sample.html`.

## Examples

Draft a review from the journal and add a reminder for it, `POST /api/reviews/generate`:

```json
{
  "type": "daily",
  "createReminder": true
}
```

Supported review types are `daily`, `weekly`, `mistake`, `risk` and `strategy`. Generated reviews are rule-based
summaries of the journal, the risk defaults, strategy context and checklist state. A reminder is an `Alert` record
only.

Save an idea, `POST /api/ideas`:

```json
{
  "title": "BTC liquidity retest observation",
  "market": "crypto",
  "symbols": ["BTCUSDT"],
  "type": "market_observation",
  "status": "watching",
  "thesis": "Review whether reclaim conditions match the playbook.",
  "invalidation": "Ignore below the session midpoint.",
  "confidence": 6,
  "tags": ["liquidity", "review"]
}
```

Ideas are private research and review records. They do not create orders or external actions.
