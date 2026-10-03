import Redis from "ioredis";
import { getRedisUrl } from "@/lib/env";
import { AppError } from "@/lib/api/errors";
import { clientIp } from "@/lib/security/client-ip";

type Bucket = {
  count: number;
  resetAt: number;
};

const memoryBuckets = new Map<string, Bucket>();
let redis: Redis | null | undefined;

function getRedisClient() {
  if (redis !== undefined) {
    return redis;
  }

  const url = getRedisUrl();
  if (!url) {
    redis = null;
    return redis;
  }

  redis = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false
  });
  redis.on("error", () => undefined);
  return redis;
}



async function redisLimit(key: string, windowSeconds: number) {
  const client = getRedisClient();
  if (!client) {
    return null;
  }

  try {
    if (client.status === "wait") {
      await client.connect();
    }
    const count = await client.incr(key);
    if (count === 1) {
      await client.expire(key, windowSeconds);
    }
    return count;
  } catch {
    return null;
  }
}

function memoryLimit(key: string, windowSeconds: number) {
  const now = Date.now();
  const current = memoryBuckets.get(key);
  if (!current || current.resetAt <= now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return 1;
  }

  current.count += 1;
  return current.count;
}

export async function enforceRateLimit(request: Request, scope: string, limit = 20, windowSeconds = 60) {
  const ip = clientIp(request) ?? "local";
  const key = `rate:${scope}:${ip}`;
  const count = (await redisLimit(key, windowSeconds)) ?? memoryLimit(key, windowSeconds);

  if (count > limit) {
    // Once per window: shows which address the limit is keyed on (behind an extra proxy or CDN it would be the
    // proxy's, shared by everyone; see TRUSTED_PROXY_HOPS in .env.example).
    if (count === limit + 1) console.warn(`rate limited: ${scope} for ${ip}`);
    throw new AppError("RATE_LIMITED", "Too many requests. Please try again later.", 429);
  }
}

