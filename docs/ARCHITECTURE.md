# Nazm Architecture

## Summary
Nazm is a modular Next.js App Router application. It is a second-brain system for reviewing trading behavior, not an execution platform.

## Frontend
- `src/app/[locale]`: localized Persian/English routes.
- `src/components`: reusable layout and UI primitives.
- `src/features`: landing, demo, dashboard, growth, ideas, reviews, journal, plans, risk, strategies, news, AI, learning, admin.
- Persian uses RTL; English uses LTR.

## Backend
- `src/app/api`: REST route handlers.
- `src/lib/services`: service layer for Prisma and provider orchestration.
- `src/lib/calculations`: pure risk, journal, portfolio, and backtest logic.
- `src/lib/import`: CSV parsing, mapping, and preview validation.
- `src/lib/security`: sessions, hashing, rate limiting, audit logs, TOTP.

## Data
PostgreSQL stores users, sessions, roles, trades, journal entries, trade plans, CSV imports, strategies, performance summaries, risk profiles, watchlists, ideas, reviews, news/context, AI reviews, learning content, attachments, audit logs, and feature flags.

The MVP data flow stays focused on authenticated analytics, journaling, planning, learning, and local provider fallbacks.

## Review Engine

The Review Engine uses the Prisma-backed `Review` model for daily, weekly, mistake, risk, and strategy reviews. `src/lib/services/reviews.ts` owns deterministic checklist generation, journal/risk/strategy summaries, completion updates, and reminder alert creation. The legacy `WeeklyReview` model remains for compatibility, while new workflows use `Review`.

## Conference Demo and PWA

The localized landing page explains the second-brain narrative, while `/[locale]/demo` provides a presentation walkthrough. PWA files live under `public/` with an offline shell at `/offline` and service-worker registration in the root layout.

## Providers
- AI provider abstraction with deterministic local fallback.
- News provider abstraction with deterministic local fallback.
- Future provider adapters can be added without changing UI contracts.

## Security
All APIs use Zod validation, safe response envelopes, httpOnly signed sessions, bcrypt password hashing, rate limiting, RBAC helpers, and audit logs.
