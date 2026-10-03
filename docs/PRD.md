# Nazm Product Requirements Document

## Positioning
Nazm is a bilingual Persian/English Discipline OS for traders. It helps traders plan before sessions, journal quickly, review behavior, detect repeated mistakes, organize strategy playbooks, understand market/news context, and improve discipline over time.

Nazm is an analytics, planning, learning, and review workspace. It is not a broker, signal product, or financial advisor.

## Supported MVP Markets
- Forex
- Crypto
- Global Stocks

The MVP intentionally focuses on these three markets and does not add other asset classes or live brokerage workflows.

## Target Users
- Professional traders who need disciplined review workflows.
- Serious trading students who need learning support and safer explanations.
- Persian-speaking and English-speaking traders who need native RTL/LTR workflows.

## MVP Scope
- Authentication and user settings.
- Persian/English i18n and RTL/LTR layouts.
- Discipline command center dashboard.
- Manual trade journal and CSV import with flexible mapping architecture.
- Trade planning and pre-trade checklist.
- Strategy/playbook management.
- Performance and behavior analytics for improvement, not prediction.
- Risk discipline assistant and calculators.
- Watchlists for organization and notes.
- News and market context module with local fallback provider.
- AI coaching provider abstraction with deterministic local fallback.
- Learning mode with glossary, prompts, templates, and explanations.
- Simple admin overview, provider status, feature flags, and audit logs.
- Tests, Docker, CI, and documentation.

## Postponed
- Real paid news/AI providers.
- Read-only import adapters for additional export formats.
- Deeper analytics by strategy, session, setup, mistake, and emotion.

## Success Criteria
- App runs locally at `http://localhost:3000`.
- English and Persian routes render correctly.
- Demo user can log in.
- Journal, trade planning, CSV preview/import, strategy, risk, news, learning, and AI coaching flows are usable locally.
- AI/news modules require no external paid API key for MVP.
