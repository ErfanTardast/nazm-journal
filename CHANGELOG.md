# Changelog

All notable changes to Nazm are listed here. Versions follow [Semantic Versioning](https://semver.org/); while the
version is 0.x, a minor version can change behaviour.

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

[0.1.0]: https://github.com/ErfanTardast/nazm-journal/releases/tag/v0.1.0
