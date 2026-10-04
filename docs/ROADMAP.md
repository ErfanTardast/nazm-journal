# Nazm roadmap

Where Nazm is heading, in rough order. This is a direction, not a schedule or a promise: it has no dates, and an item
moves when the maintainers' time and what users report say it should. For what the product does today, see
`docs/PRD.md`, and for what changed in each version, `CHANGELOG.md`.

## Shipped

- Import of an MT5 history report or a CSV file, with sample data and a first-run flow for a new account.
- The journal, strategies with limits, plans that start from a strategy, and the risk desk.
- Reviews, repeated-mistake memory, the discipline score and streak, performance in money and in R, and a rule-based
  coach.
- A scenario simulator, watchlists, alerts, ideas, portfolios kept by hand and a learning glossary.
- Persian (right to left) and English, an installable PWA, and a Docker image that applies migrations on start.
- Payments exist as manual-review transfers and are off by default.

## Next

- **Performance analytics.** Go beyond today's equity curve, drawdown, win rate, expectancy and results per strategy
  and setup, with more ways to look at the journal.
- **An action-oriented dashboard.** A redesign of Home around the next thing to do.

## Later

- **Forgot-password with e-mail delivery.** Today nothing is e-mailed, so a forgotten password cannot be reset by the
  person; this needs an outgoing mail channel first.
- **Strategy versioning.** Keep the history of a strategy's rules, so a trade is reviewed against the version it
  followed.
- **More alert types.** Alerts today cover price, indicator, risk, journal reminders and the daily and weekly review.
- **Real backtesting.** The scenario simulator replays a list of trades that you enter. It does not test a strategy
  against historical prices.

## Not on the roadmap

Placing orders, connecting to a broker or exchange account, trading signals, price predictions and financial advice.
Nazm reviews and plans trades; it does not make or execute them. Read-only import of a trader's own history, such as
the MT5 report and CSV, stays in scope.
