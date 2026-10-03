# Nazm

**Nazm — the trader's discipline journal.** Plan every trade, log it, review it, and improve. Bilingual: Persian
(right to left, the primary language) and English.

Nazm imports your MetaTrader 5 history, keeps a journal with your plans and rules next to each trade, finds the
mistakes you repeat, and keeps risk inside the limits you set. It is a review and discipline tool: it does not connect
to a broker, does not place orders, and gives no signals or financial advice.

> **نظم — دفتر انضباط معامله‌گر.** برنامه‌ریزی، ثبت، مرور و بهبود معاملات؛ فارسی (راست‌به‌چپ) و انگلیسی.

## What is in it

- **First run:** a new account answers two short questions (how you trade, what you want first) and is sent where it
  can start: an MT5 trader reaches the import in three clicks. Every step can be skipped.
- **Sample data:** an empty journal can load one clearly labelled month of sample trades, plans and reviews to see the
  product filled in. One button removes it, and your first real trade removes it automatically.
- **MT5 import:** upload the MT5 history report (HTML) or a CSV; ladder legs of one entry count as one trade, and
  uploading the same report again creates no duplicates. Broker time zone in Settings.
- **Strategy, plan, risk:** strategies carry optional risk limits; a plan can start from a strategy and shows a warning
  before saving when it breaks a limit; the risk desk opens from a plan, sizes it, and saves the result into the plan.
- **Plans and journal:** a plan per trade (entry, stop, target, invalidation, checklist), converted into a journal
  entry when you take the trade; notes, emotions, rule adherence, mistakes, attachments.
- **Reviews and coach:** daily and weekly reviews, repeated-mistake memory, discipline streak, and a rule-based coach
  that runs on the server. An outside AI provider is optional and off by default.
- **Also:** prop-firm guard rules, a scenario simulator, watchlists, alerts, ideas, a learning glossary.
- **Accounts:** invite-only or open sign-up, a request-access form with an admin list, password change, data export
  and account deletion from Settings. Two-factor sign-in works once it is turned on through the API
  (`/api/auth/2fa/*`); there is no settings screen for it yet.
- **App:** Next.js App Router, installable as a PWA, offline page, security headers, rate limits.

Stack: Next.js 16, React 19, TypeScript, Prisma 7 with PostgreSQL 16, Tailwind CSS, Vitest and Testing Library,
Playwright. Optional Redis (the app falls back to memory).

## Run it with Docker (quickest)

Requirements: Docker Desktop.

```bash
docker compose up --build
```

Open http://localhost:3000/fa (or `/en`). The local stack opens sign-up to everyone (`REGISTRATION_OPEN=true` in
`docker-compose.yml`), so create an account and follow the first-run steps.

## Develop locally

Requirements: Node.js 24, Docker (for PostgreSQL), or your own PostgreSQL 16.

```bash
npm ci
docker compose up -d db redis
cp .env.example .env            # the defaults match the compose database
npx prisma generate
npx prisma migrate deploy
npm run db:seed                 # demo account and sample content
npm run dev
```

Outside production the app runs in demo mode: the sign-in form is prefilled with the seeded demo login
(`demo@nazm.example` / `DemoPassword123!`, local use only).

`npm run db:check` explains what is wrong when the database cannot be reached.

## Checks

```bash
npm run typecheck
npm run lint
npm run test        # unit and component tests (Vitest)
npm run build
npx playwright test # end-to-end, against a running app
```

## Self-hosting in production

Every setting is described in `.env.example`. The ones that matter:

| Variable | Why |
|---|---|
| `DATABASE_URL` | PostgreSQL; the container applies migrations on start (`scripts/docker-entrypoint.sh`). |
| `SESSION_SECRET` | At least 32 random characters. |
| `APP_URL` | The public address. |
| `REGISTRATION_INVITE_CODE` or `REGISTRATION_OPEN=true` | Production closes sign-up unless one of them is set. |
| `ADMIN_EMAILS` | Gives the admin role on sign-in to existing accounts with these addresses. Register your own account first, then set it: a listed address that has no account cannot be registered. |
| `TRUSTED_PROXY_HOPS` | How many proxies sit in front of the app, so rate limits see the real client address. |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Optional public contact shown on the privacy page. |

Payments and demo mode are off in production builds unless `NEXT_PUBLIC_PAYMENTS_ENABLED` or
`NEXT_PUBLIC_DEMO_MODE` is set at build time. `npm run verify:deploy -- https://your-host.example` checks a deployed
invite-only instance from outside (health, headers, hidden payment pages, invite-only sign-up, rate limits). Do not
run it against an instance with `REGISTRATION_OPEN=true`: its sign-up check would fail and create an account there.

More: `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/SECURITY.md`, `docs/RELEASE.md`.

## CSV import format

```csv
symbol,market,side,status,entryPrice,exitPrice,stopLoss,takeProfit,quantity,fees,openedAt,closedAt,session,setupType,emotionalState,mistakes,tags,notes
BTCUSDT,crypto,long,closed,100,110,95,120,1,1,2026-06-10T00:00:00.000Z,2026-06-10T02:00:00.000Z,London,Breakout,Focused,,breakout|discipline,Followed checklist
```

## License

Copyright (C) 2026 the Nazm authors.

This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General
Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any
later version. It is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied
warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See [LICENSE](LICENSE).

If you run a modified version as a network service, the AGPL asks you to offer its source code to the people who use it.

Nazm is not a broker or a financial advisor, and nothing in it is investment advice.
