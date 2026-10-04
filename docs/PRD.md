# Nazm product requirements

## Positioning

Nazm is a trading journal and discipline tool for traders, in Persian (right to left, the primary language) and
English. A trader plans a trade, records it, reviews it, and keeps risk inside their own limits. The name is Nazm; in
Persian it is «نظم».

- **One-liner (EN):** Plan, journal, review, and improve your trading discipline.
- **One-liner (FA):** پلن، ژورنال، مرور و بهبود انضباط معاملاتی.

Nazm is an analytics, planning, learning and review workspace. It is not a broker, a signal service or a financial
advisor.

## What Nazm will not do

- Place, route or execute orders, or connect to a broker or exchange account.
- Give trading signals, price predictions or buy and sell calls. The coach refuses such requests before it answers.
- Give financial advice, or promise or imply a profit.
- Connect to live market data.

`tests/unit/product-scope.test.ts` and the coach's guard tests keep the screens and the coach inside this scope.

## Markets

Forex, crypto and global stocks. Other asset classes are not supported.

## Who it is for

- Traders who want a journal that makes them review their behaviour, not only their results.
- Traders who use MetaTrader 5 (MT5) and want their history in without retyping it.
- Persian-speaking and English-speaking traders who need screens that are native right to left and left to right.
- Students who need plain explanations: the glossary and the coach's learning mode.

## What Nazm does today

**Getting started**

- A first-run flow: two short questions send a new account to the screen to start with, and every step can be skipped.
- Sample data: an empty account can load one labelled month of sample trades, strategies, plans and reviews, and
  remove it with one button. The first real trade or import removes it automatically.
- Import of an MT5 history report (HTML) or a CSV file, with column mapping and a preview before anything is saved.
  Ladder legs of one entry count as one trade, importing the same report again adds nothing, and the broker's time zone
  is set in Settings.

**Plan**

- Strategies (playbooks) with entry, exit, invalidation and risk rules, and optional limits for risk per trade, daily
  loss and open positions.
- Plans that start from a strategy, carry its checklist, and warn before saving when they break one of its limits.
- The risk desk: quick calculators (position size, forex lot size, liquidation estimate, reward to risk, stop distance)
  and a position planner that sizes one of your plans, checks it against your limits and saves the sizing into the plan.
- Trading sessions: a working session with a daily loss limit, the strategies allowed in it and one mistake to avoid.

**Journal**

- Trades with their plan, risk, emotions, rule adherence, mistakes, notes and screenshots; quick entry; editing a
  trade's review for one leg or for the whole entry.

**Review**

- Daily, weekly, mistake, risk and strategy reviews, with checklists, reminders and next actions carried forward.
- Repeated-mistake memory, a discipline score and streak, and how closely each playbook's rules were followed.
- Performance in money and in R: win rate, expectancy, drawdown, the equity curve and results per strategy and setup.
- A rule-based coach that runs on the server and needs no outside service. An outside AI provider is optional and off
  by default.
- Prop-firm guard rules from the trader's own limits, and a mentor report that can hide money figures for sharing.

**Also**

- A scenario simulator that replays a list of trades, watchlists, ideas, portfolios kept by hand, a learning glossary,
  and news and context (built-in samples, or an HTTP feed).
- Alerts and reminders, shown in the app, and sent to a webhook, Telegram or Discord when the server is set up for them.

**Accounts and running it**

- Sign-up is open, invite-only or closed, set by the server. A request-access form feeds an admin list.
- Password change, two-factor sign-in through the API, a data export, and account deletion.
- Persian and English, right to left and left to right, and an installable PWA with an offline page.
- A Docker image that applies database migrations on start, a local Docker Compose stack, rate limits (Redis optional)
  and security headers.
- Payments exist in the code (plan purchases by manual-review transfer) and are off by default: they are on only
  outside production, or in a build made with `NEXT_PUBLIC_PAYMENTS_ENABLED=true`.

## Success criteria

- The app runs locally at `http://localhost:3000` from the steps in the README.
- English and Persian pages render correctly, left to right and right to left.
- A trader with an MT5 report gets from a new account to imported trades in a few clicks, without typing a trade.
- Journal, plans, import, strategies, risk and the coach work without any outside paid API key.
- In demo mode, the seeded demo user can sign in.

What comes next is in `docs/ROADMAP.md`.
