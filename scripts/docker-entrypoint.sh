#!/bin/sh
set -eu

# Fail clearly when the database is not configured (otherwise Prisma falls back to its build-time placeholder URL).
: "${DATABASE_URL:?DATABASE_URL is required}"

# Apply pending migrations; a failure stops the start. (No `prisma db push` fallback: it would alter the schema
# of a live database outside the migration history.)
npm run prisma:deploy

# Demo data (an admin with a published password) only for an image built as a demo: the flag is baked in at build
# time, so a NEXT_PUBLIC_DEMO_MODE variable set on the host cannot trigger it.
if [ "$(cat .build-demo-mode 2>/dev/null)" = "true" ]; then
  NEXT_PUBLIC_DEMO_MODE=true DEMO_SEED=true npm run prisma:seed
fi

# next itself as PID 1, so a stop signal ends it cleanly (npm run would report the signal as a failure).
exec node_modules/.bin/next start
