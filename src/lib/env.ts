import crypto from "node:crypto";

const ephemeralSessionSecret = crypto.randomBytes(48).toString("hex");

export function getDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  if (process.env.NEXT_PHASE === "phase-production-build") {
    return "postgresql://nazm:nazm@localhost:5432/nazm?schema=public";
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL is required in production");
  }

  return "postgresql://nazm:nazm@localhost:5432/nazm?schema=public";
}

export function getRedisUrl() {
  return process.env.REDIS_URL;
}

export function getSessionSecret() {
  if (process.env.SESSION_SECRET) {
    return process.env.SESSION_SECRET;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is required in production");
  }

  return ephemeralSessionSecret;
}

export function getAppUrl() {
  return process.env.APP_URL ?? "http://localhost:3000";
}

export function isProduction() {
  return process.env.NODE_ENV === "production";
}

export function getAiProviderName() {
  return process.env.AI_PROVIDER ?? "local";
}

export function getOpenAiKey() {
  return process.env.OPENAI_API_KEY ?? "";
}

export function getOpenAiModel() {
  return process.env.OPENAI_MODEL ?? "gpt-4o-mini";
}

export function getOpenAiBaseUrl() {
  return process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
}

export function getAiDailyCallCap() {
  const parsed = Number(process.env.AI_DAILY_CALL_CAP ?? "50");
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 50;
}

/** True only when an external AI provider is selected AND its key is present. */
export function isOpenAiConfigured() {
  return getAiProviderName() === "openai" && getOpenAiKey().length > 0;
}

export function getNewsProviderName() {
  return process.env.NEWS_PROVIDER ?? "local";
}

export function getNewsApiUrl() {
  return process.env.NEWS_API_URL ?? "";
}

export function getNewsApiKey() {
  return process.env.NEWS_API_KEY ?? "";
}

export function getNewsCacheTtlSeconds() {
  const parsed = Number(process.env.NEWS_CACHE_TTL_SECONDS ?? "600");
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 600;
}

/** True only when HTTP news provider is selected AND API URL is present. */
export function isHttpNewsConfigured() {
  return getNewsProviderName() === "http" && getNewsApiUrl().length > 0;
}

export function getTelegramBotToken() {
  return process.env.TELEGRAM_BOT_TOKEN ?? "";
}

export function getTelegramChatId() {
  return process.env.TELEGRAM_CHAT_ID ?? "";
}

export function getDiscordWebhookUrl() {
  return process.env.DISCORD_WEBHOOK_URL ?? "";
}

export function getEmailFrom() {
  return process.env.EMAIL_FROM ?? "";
}
