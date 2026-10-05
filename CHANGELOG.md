# Changelog

All notable changes to Nazm are listed here. Versions follow [Semantic Versioning](https://semver.org/); while the
version is 0.x, a minor version can change behaviour.

## [0.2.0] - 2026-10-05

Performance analytics and a dashboard that says what to do today.

### Added

- **Performance page:** periods of 7, 30 and 90 days or all time, counted in the time zone from Settings; six labelled
  headline cards (net P&L, win rate, profit factor, expectancy, average R, drawdown) with a one-line explanation each;
  one chart for equity and drawdown; the R distribution; breakdowns by strategy, symbol, market, side, session, weekday,
  setup, mistake and emotion, worst first; a behaviour panel (rule adherence against result, re-entry within 30
  minutes after a loss, results by order in the day, how trades ended against stop and target).
- **See these trades:** every breakdown row opens the journal with exactly its trades and a chip that says what is shown.
- **Dashboard:** today first (today's result against the daily loss limit, today's plans, open reviews), then the
  last 30 days, one focus finding for the week, recent trades with their review status, and quick actions.
- `GET /api/performance` and `GET /api/performance/trades`.

### Changed

- One metrics module behind the Performance page, the dashboard and the guard: ladder legs count as one entry, sample
  trades never mix with your own, and the daily loss on the dashboard and in the guard is the same number.
- Persian pages show Persian digits on the Performance page, the dashboard, the discipline panel and the streak.

### Removed

- The old analytics summaries the Performance page used (their breakdowns did not match the headline numbers).

## [0.1.0] - 2026-10-04

The first public release. Nazm is a trading journal and discipline tool in Persian (right to left) and English.

### Added

- **First run:** two short questions (how you trade, what you want first) send a new account where it can start; an
  MT5 trader reaches the import in three clicks. Every step can be skipped.
- **Sample data:** an empty account can load one labelled month of sample trades, strategies, plans and reviews, and
  remove it with one button. The first real trade removes it automatically.
- **Import:** the MetaTrader 5 history report (HTML) or a CSV file. Ladder legs of one entry count as one trade,
  importing the same report again adds nothing, and the broker's time zone is set in Settings.
- **Journal:** trades with their plan, risk, emotions, rule adherence, mistakes, notes and attachments; quick entry;
  editing a trade's review for one leg or the whole entry.
- **Strategies, plans and the risk desk:** strategies with optional risk limits; a plan can start from a strategy and
  warns before saving when it breaks a limit; the risk desk sizes a plan and saves the sizing into it.
- **Review:** daily and weekly reviews, repeated-mistake memory, a discipline score and streak, performance in money
  and in R with drawdown, and a rule-based coach that runs on the server (an outside AI provider is optional and off by
  default).
- **Also:** prop-firm guard rules, a scenario simulator, watchlists, alerts, ideas and a learning glossary.
- **Accounts:** open, invite-only or closed sign-up; a request-access form with an admin list; password change; data
  export and account deletion in Settings; two-factor sign-in through the API.
- **Running it:** Docker Compose for a local stack, a production Docker image that applies database migrations on
  start, an installable PWA, security headers and rate limits. The public pages follow the server's sign-up mode
  (open, invite-only or closed), a "Source code" link points at the public repository (or at `NEXT_PUBLIC_SOURCE_URL`
  for a modified copy), and the operator can reset a password with `npm run user:reset-password`.
- **Samples:** a synthetic MT5 report and a CSV in `docs/samples` to try the import without your own data.

[0.2.0]: https://github.com/ErfanTardast/nazm-journal/releases/tag/v0.2.0
[0.1.0]: https://github.com/ErfanTardast/nazm-journal/releases/tag/v0.1.0
