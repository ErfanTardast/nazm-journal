# Nazm Security

Nazm is a journal, planning, learning, risk, and context tool focused on review workflows.

## Implemented
- bcrypt password hashing.
- Database-backed sessions with signed httpOnly cookies.
- Zod validation for API inputs.
- Redis-backed rate limiting with development fallback.
- Safe API error envelopes.
- Audit logs for sensitive actions.
- RBAC helpers for admin surfaces.
- No hardcoded secrets.
- AI and news disclaimers that forbid profit guarantees and buy/sell commands.

## Environment
Secrets are configured through `.env`:
- `DATABASE_URL`
- `REDIS_URL`
- `SESSION_SECRET`
- `APP_URL`
- Optional future provider keys.

## Postponed
- External provider credential storage beyond local fallback mode.
- Community moderation.
- Broker or exchange API key storage.
