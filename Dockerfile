FROM node:24-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Server-local time is UTC; user-facing times use each user's time zone settings.
ENV TZ=UTC

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json ./
# The cache mount keeps npm's downloads between builds (BuildKit, the default in Docker Desktop and Compose v2), so
# a build that a dropped connection stopped resumes instead of downloading everything again.
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000

FROM deps AS builder
# NEXT_PUBLIC_* values are compiled into the build; pass them as build args to change them (README, Self-hosting).
ARG NEXT_PUBLIC_PAYMENTS_ENABLED=""
ARG NEXT_PUBLIC_DEMO_MODE=""
ENV NEXT_PUBLIC_PAYMENTS_ENABLED=$NEXT_PUBLIC_PAYMENTS_ENABLED
ENV NEXT_PUBLIC_DEMO_MODE=$NEXT_PUBLIC_DEMO_MODE
COPY . .
RUN npx prisma generate
RUN npm run build
# Remember the build's demo flag: the entrypoint seeds demo data only for an image built as a demo, never because
# of a runtime variable.
RUN printf '%s' "$NEXT_PUBLIC_DEMO_MODE" > .build-demo-mode

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app ./
RUN chmod +x scripts/docker-entrypoint.sh
EXPOSE 3000
CMD ["sh", "scripts/docker-entrypoint.sh"]

