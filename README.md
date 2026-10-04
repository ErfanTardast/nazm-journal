# Nazm

[![CI](https://github.com/ErfanTardast/nazm-journal/actions/workflows/ci.yml/badge.svg)](https://github.com/ErfanTardast/nazm-journal/actions/workflows/ci.yml)
[![License: AGPL-3.0-or-later](https://img.shields.io/badge/license-AGPL--3.0--or--later-blue)](LICENSE)
[![Node.js 24](https://img.shields.io/badge/node-%3E%3D24-339933)](.nvmrc)

**Nazm — the trader's discipline journal.** Plan every trade, log it, review it, and keep risk inside the limits you
set. Bilingual: Persian (right to left, the primary language) and English. Self-hosted, open source (AGPL-3.0).

Nazm imports your MetaTrader 5 history, keeps a journal with your plans and rules next to each trade, finds the mistakes
you repeat, and sizes positions from the risk you allow. It is a review and discipline tool: it does not connect to a
broker, does not place orders, and gives no signals or financial advice.

![The journal with the built-in sample data: results, the trade log and one trade's review](docs/images/journal-en.png)

| Performance in money and in R | The risk desk sizing a plan |
|---|---|
| ![Performance review with the equity curve](docs/images/performance-en.png) | ![Position planner opened from a plan](docs/images/risk-desk-en.png) |

| فارسی، راست‌به‌چپ | On a phone |
|---|---|
| ![The Persian journal](docs/images/journal-fa.png) | ![The Persian dashboard on a phone](docs/images/dashboard-fa-phone.png) |

*Screenshots show the labelled sample data that any new account can load (and remove) with one button.*

## اپ نظم به فارسی

**نظم — دفتر انضباط معامله‌گر.** برای هر معامله پیش از ورود پلن بنویسید، آن را ثبت و مرور کنید و ریسک را در حدی که
خودتان گذاشته‌اید نگه دارید. اپ نظم تاریخچه‌ی متاتریدر ۵ را وارد می‌کند، اشتباه‌های تکراری را نشان می‌دهد و حجم معامله را از درصد ریسک
حساب می‌کند. اپ نظم به کارگزار وصل نمی‌شود، سفارش ثبت نمی‌کند و سیگنال یا توصیه‌ی مالی نمی‌دهد.

اجرای سریع با Docker:

```bash
git clone https://github.com/ErfanTardast/nazm-journal.git
cd nazm-journal
docker compose up --build
```

بعد `http://localhost:3000/fa` را باز کنید، حساب بسازید و داده‌ی نمونه را بارگذاری کنید یا فایل نمونه‌ی
`docs/samples/mt5-report-sample.html` را در صفحه‌ی «ورود معاملات» بارگذاری کنید. برای گزارش باگ یا پیشنهاد، در گیت‌هاب
یک ایشو (Issue) باز کنید، به فارسی یا انگلیسی؛ راهنمای مشارکت در [CONTRIBUTING.md](CONTRIBUTING.md) است.

## What is in it

- **First run:** a new account answers two short questions (how you trade, what you want first) and is sent where it
  can start: an MT5 trader reaches the import in three clicks. Every step can be skipped.
- **Sample data:** an empty account can load one clearly labelled month of sample trades, strategies, plans and
  reviews. One button removes it, and your first real trade removes it automatically.
- **Import:** the MT5 history report (HTML) or a CSV. Ladder legs of one entry count as one trade, importing the same
  report again adds nothing, and the broker's time zone is set in Settings.
- **Strategy, plan, risk:** strategies carry optional risk limits; a plan can start from a strategy and warns before
  saving when it breaks a limit; the risk desk opens from a plan, sizes it, and saves the sizing into the plan.
- **Journal:** a plan per trade (entry, stop, target, invalidation, checklist), converted into a journal entry when you
  take the trade; notes, emotions, rule adherence, mistakes, attachments.
- **Review:** daily and weekly reviews, repeated-mistake memory, a discipline score and streak, performance in money
  and in R with drawdown, and a rule-based coach that runs on your server. An outside AI provider is optional and off
  by default.
- **Also:** prop-firm guard rules, a scenario simulator, watchlists, alerts, ideas, a learning glossary.
- **Accounts:** open, invite-only or closed sign-up, a request-access form with an admin list, password change, data
  export and account deletion in Settings. Two-factor sign-in works once it is turned on through the API
  (`/api/auth/2fa/*`); there is no settings screen for it yet.

Stack: Next.js 16 (App Router), React 19, TypeScript, Prisma 7 with PostgreSQL 16, Tailwind CSS, Vitest and Testing
Library, Playwright. Redis is optional (rate limits fall back to memory).

## Try it with Docker

Requirements: Docker Desktop, or Docker Engine with Compose v2.

```bash
git clone https://github.com/ErfanTardast/nazm-journal.git
cd nazm-journal
docker compose up --build
```

The first build downloads the dependencies and takes about 4 to 5 minutes. If it stops at `npm ci` with a network
error (for example `EIDLETIMEOUT`, `EAI_AGAIN` or "Exit handler never called!"), run the same command again: the
packages already downloaded are kept, so the next attempt only fetches the rest.

Open http://localhost:3000/fa (Persian) or http://localhost:3000/en (English). This local stack has open sign-up, so
create an account and follow the first-run steps; then load the sample data, or import one of the
[sample files](#try-the-import).

- Ports 3000, 5432 and 6379 are published on this computer only. If one is taken, choose another:
  `APP_PORT=3001 DB_PORT=5433 docker compose up --build` (or put those variables in a `.env` file next to
  `docker-compose.yml`).
- Stop with `Ctrl+C` or `docker compose down`. `docker compose down -v` also deletes the database.
- `docker-compose.yml` is for trying Nazm on your own computer: its database password and session secret are public and
  sign-up is open. To run Nazm for other people, see [Self-hosting](#self-hosting).

## Try the import

- **MetaTrader 5:** in the History tab switch the view to Positions, right-click, Report, HTML. Upload that file as it is
  on the import page. No MT5? Use [`docs/samples/mt5-report-sample.html`](docs/samples/mt5-report-sample.html): a
  synthetic report with ten positions, two of them legs of one entry. Uploading it a second time adds nothing.
- **CSV:** [`docs/samples/trades-sample.csv`](docs/samples/trades-sample.csv), or "Download sample CSV" on the import
  page. The import page maps your own column names. Required: `symbol`, `market` (`crypto`, `forex`, `stocks`), `side`
  (`long`, `short`), `entryPrice`, `quantity`, `openedAt` (ISO 8601). Optional: `status` (`open`, `closed`, `planned`,
  `canceled`), `exitPrice`, `stopLoss`, `takeProfit`, `fees`, `closedAt`, `session`, `setupType`, `emotionalState`,
  `mistakes` and `tags` (separated by `|`), `notes`, `postTradeNotes`, `lessonsLearned`, `ruleFollowed` (`followed`,
  `broken`, `mixed`, `unknown`). Up to 500,000 characters per upload.

```csv
symbol,market,side,status,entryPrice,exitPrice,stopLoss,takeProfit,quantity,fees,openedAt,closedAt,session,setupType,emotionalState,mistakes,tags,notes
BTCUSDT,crypto,long,closed,100,110,95,120,1,1,2026-09-24T00:00:00.000Z,2026-09-24T02:00:00.000Z,London,Breakout,Focused,,breakout|discipline,Followed checklist
```

## Develop locally

Requirements: Node.js 24 (see `.nvmrc`), and Docker for PostgreSQL and Redis (or your own PostgreSQL 16; Redis is
optional).

```bash
npm ci
docker compose up -d db redis
cp .env.example .env            # the defaults match the compose database
npx prisma generate
npx prisma migrate deploy
npm run db:seed                 # demo account and demo content
npm run dev
```

Open http://localhost:3000/fa. `npm ci` takes a few minutes the first time, and in development the first visit of each
page compiles it (a few seconds).

Outside production the app runs in demo mode: the sign-in form is prefilled with the seeded demo login
(`demo@nazm.example` / `DemoPassword123!`, local use only), and that account is an admin. The plan pages with manual
payment review are also on in development; production builds hide them unless `NEXT_PUBLIC_PAYMENTS_ENABLED=true` at
build time.

`npm run db:check` explains what is wrong when the database cannot be reached. If you changed `DB_PORT` or
`REDIS_PORT`, change the port in `DATABASE_URL` and `REDIS_URL` in `.env` too.

## Checks

The same four steps run in CI on every pull request (CI also fails on a critical advisory in a runtime dependency,
`npm audit --omit=dev --audit-level=critical`):

```bash
npm run typecheck
npm run lint
npm run test        # about 3,000 unit and component tests (Vitest)
npm run build
```

### End-to-end tests

```bash
npx playwright install chromium   # once
npx playwright test
```

They need the migrated and seeded database from [Develop locally](#develop-locally) (they sign in as the demo user).
Playwright starts its own development server on port 3100; set `PLAYWRIGHT_BASE_URL=http://localhost:3000` to test a
development server that is already running (`npm run dev` on the seeded database) instead. The Docker stack has no
demo account, so the tests cannot sign in there.

## Self-hosting

The Docker image applies database migrations when it starts (`scripts/docker-entrypoint.sh`). Payments and demo mode
are off in it unless `NEXT_PUBLIC_PAYMENTS_ENABLED` or `NEXT_PUBLIC_DEMO_MODE` is set to `true` as a build argument
(`docker build --build-arg NEXT_PUBLIC_PAYMENTS_ENABLED=true ...`). The build needs BuildKit: Docker 23 or newer, or
`DOCKER_BUILDKIT=1 docker build ...` on an older engine with the buildx plugin.

```bash
docker build -t nazm .
docker run -d --name nazm --restart unless-stopped -p 127.0.0.1:3000:3000 \
  -e DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/nazm' \
  -e SESSION_SECRET='at least 32 random characters' \
  -e APP_URL='https://journal.example.com' \
  -e REGISTRATION_INVITE_CODE='a code you give to the people you invite' \
  -e TRUSTED_PROXY_HOPS=1 \
  nazm
```

- Run it behind an HTTPS reverse proxy (Caddy, nginx, Traefik) that sets `X-Forwarded-For`, and never expose port 3000
  directly: the rate limits read the client address from that header, and the session cookie is `Secure` in
  production, so sign-in needs HTTPS.
- Back up the PostgreSQL database; upgrade by pulling, rebuilding the image and starting it again (migrations run on
  start).

Every setting is described in [`.env.example`](.env.example). The ones that matter:

| Variable | Why |
|---|---|
| `DATABASE_URL` | PostgreSQL connection. |
| `SESSION_SECRET` | At least 32 random characters. |
| `APP_URL` | The public address. |
| `REGISTRATION_INVITE_CODE` or `REGISTRATION_OPEN=true` | Production keeps sign-up closed unless one of them is set. With an invite code, the public pages describe an invite-only server and offer a request-access form. |
| `ADMIN_EMAILS` | Gives the admin role on sign-in to existing accounts with these addresses. Register your own account first, then set it: a listed address that has no account cannot be registered. |
| `TRUSTED_PROXY_HOPS` | How many proxies append to `X-Forwarded-For` in front of the app (at least 1). |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Optional public contact shown on the privacy page. |
| `NEXT_PUBLIC_SOURCE_URL` | Where the app's "Source code" link points. If you run a modified version, the AGPL asks you to offer your source to its users: point this at your fork. |

A forgotten password cannot be reset by e-mail yet; the operator resets it on the server. The password is read at a
prompt that does not echo it, so it never appears on a command line (12 to 128 characters, with an uppercase letter, a
lowercase letter and a number):

```bash
read -rsp 'New password: ' RESET_PASSWORD && export RESET_PASSWORD
RESET_EMAIL='person@example.com' npm run user:reset-password; unset RESET_PASSWORD
# in the container: docker exec -e RESET_EMAIL='person@example.com' -e RESET_PASSWORD nazm npm run user:reset-password; unset RESET_PASSWORD
```

It signs that account out everywhere. `scripts/reset-password.ts` has the PowerShell version.

`npm run verify:deploy -- https://your-host.example` checks a deployed invite-only instance from outside: health,
security headers, hidden payment and demo pages, error responses without stack traces, invite-only sign-up, the http-to-https redirect and the login rate limit (its
last check blocks sign-in from your address for about a minute). Do not run it against an instance with
`REGISTRATION_OPEN=true`: its sign-up check would fail and create an account there.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the code is organised.
- [docs/API.md](docs/API.md): the HTTP routes.
- [docs/RELEASE.md](docs/RELEASE.md): cutting a version and upgrading.
- [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), [CHANGELOG.md](CHANGELOG.md).

## Contributing

Issues and pull requests are welcome, in English or Persian. Read [CONTRIBUTING.md](CONTRIBUTING.md) first: it has the
setup, the tests, and the rules every change follows (both languages, and no order execution, broker connection,
signals or financial advice). Security problems go privately, as [SECURITY.md](SECURITY.md) says.

## License

Copyright (C) 2026 the Nazm authors.

This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General
Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any
later version. It is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied
warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See [LICENSE](LICENSE).

If you run a modified version as a network service, the AGPL asks you to offer its source code to the people who use it.

The Persian font Vazirmatn is under the SIL Open Font License (`public/fonts/vazirmatn/OFL.txt`).

Nazm is not a broker or a financial advisor, and nothing in it is investment advice.
