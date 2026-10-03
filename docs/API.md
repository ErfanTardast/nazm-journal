# Nazm API

## Contract
Success:

```json
{ "data": {} }
```

Failure:

```json
{ "error": { "code": "ERROR_CODE", "message": "Human readable message", "details": {} } }
```

## Core Routes
- Auth: `/api/auth/register`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, password reset, 2FA setup/verify/disable.
- Dashboard: `GET /api/dashboard/overview`.
- Reviews: `GET/POST/PATCH/DELETE /api/reviews`, `POST /api/reviews/generate`, `POST /api/reviews/:id/reminder`.
- Ideas: `GET/POST/PATCH/DELETE /api/ideas`.
- Trades: `GET/POST/PATCH/DELETE /api/trades`, `POST /api/trades/import`, `GET /api/trades/metrics`.
- Trade plans: `GET/POST/PATCH/DELETE /api/trade-plans`, `POST /api/trade-plans/:id/convert`.
- Strategies: `GET/POST/PATCH/DELETE /api/strategies`, `GET /api/strategies/:id/performance`.
- Risk: `POST /api/risk/position-size`, `POST /api/risk/forex-lot-size`, `POST /api/risk/liquidation`, `POST /api/risk/calculators`.
- Watchlists: `GET/POST/PATCH/DELETE /api/watchlists`.
- News: `GET /api/news`, `POST /api/news/analyze`.
- AI: `POST /api/ai/trade-review`, `POST /api/ai/weekly-review`, `POST /api/ai/strategy-review`, `POST /api/ai/news-summary`.
- Learning: `GET /api/learning/glossary`.
- Admin: `GET /api/admin/overview`.

## CSV Import
`POST /api/trades/import`

```json
{
  "filename": "nazm-sample.csv",
  "previewOnly": true,
  "mapping": {
    "symbol": "symbol",
    "market": "market",
    "side": "side",
    "entryPrice": "entryPrice",
    "exitPrice": "exitPrice",
    "quantity": "quantity",
    "openedAt": "openedAt"
  },
  "csv": "symbol,market,side,status,entryPrice,exitPrice,stopLoss,takeProfit,quantity,fees,openedAt,closedAt\nBTCUSDT,crypto,long,closed,100,110,95,120,1,1,2026-06-10T00:00:00.000Z,2026-06-10T02:00:00.000Z"
}
```

Future adapters can map common CSV export formats without adding live market connectivity.

## Reviews

`POST /api/reviews/generate`

```json
{
  "type": "daily",
  "createReminder": true
}
```

Supported review types are `daily`, `weekly`, `mistake`, `risk`, and `strategy`. Generated reviews are deterministic local summaries of journal records, risk defaults, strategy context, and checklist state. Reminder creation writes an `Alert` record only.

## Ideas / Hypothesis Vault

`POST /api/ideas`

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
