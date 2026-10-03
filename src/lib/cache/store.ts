import Redis from "ioredis";
import { getRedisUrl } from "@/lib/env";

/**
 * Small key/value store with TTL and atomic increment, backed by Redis when
 * REDIS_URL is set and falling back to an in-memory map otherwise. Mirrors the
 * resilience pattern in security/rate-limit: any Redis failure degrades to memory.
 */
type Entry = { value: string; expiresAt: number };
type Counter = { count: number; resetAt: number };

const memoryValues = new Map<string, Entry>();
const memoryCounters = new Map<string, Counter>();
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
  redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 0, enableOfflineQueue: false });
  redis.on("error", () => undefined);
  return redis;
}

async function withRedis<T>(run: (client: Redis) => Promise<T>): Promise<T | null> {
  const client = getRedisClient();
  if (!client) return null;
  try {
    if (client.status === "wait") {
      await client.connect();
    }
    return await run(client);
  } catch {
    return null;
  }
}

export async function cacheGet(key: string): Promise<string | null> {
  const fromRedis = await withRedis((client) => client.get(key));
  if (fromRedis !== null) {
    return fromRedis;
  }
  const entry = memoryValues.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memoryValues.delete(key);
    return null;
  }
  return entry.value;
}

export async function cacheSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  const done = await withRedis(async (client) => {
    await client.set(key, value, "EX", ttlSeconds);
    return true;
  });
  if (!done) {
    memoryValues.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }
}

/** Increments a counter under `key`, sets its TTL on first write, returns the new count. */
export async function cacheIncrement(key: string, windowSeconds: number): Promise<number> {
  const fromRedis = await withRedis(async (client) => {
    const count = await client.incr(key);
    if (count === 1) {
      await client.expire(key, windowSeconds);
    }
    return count;
  });
  if (fromRedis !== null) {
    return fromRedis;
  }
  const now = Date.now();
  const current = memoryCounters.get(key);
  if (!current || current.resetAt <= now) {
    memoryCounters.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return 1;
  }
  current.count += 1;
  return current.count;
}

/** Increments a counter by `amount` under `key`, sets TTL on first write, returns new total. */
export async function cacheAdd(key: string, amount: number, windowSeconds: number): Promise<number> {
  const fromRedis = await withRedis(async (client) => {
    const count = await client.incrby(key, amount);
    if (count === amount) {
      await client.expire(key, windowSeconds);
    }
    return count;
  });
  if (fromRedis !== null) return fromRedis;

  const now = Date.now();
  const current = memoryCounters.get(key);
  if (!current || current.resetAt <= now) {
    memoryCounters.set(key, { count: amount, resetAt: now + windowSeconds * 1000 });
    return amount;
  }
  current.count += amount;
  return current.count;
}

/** Reads back a counter value written by `cacheIncrement`. Returns 0 when absent/expired. */
export async function cacheGetCounter(key: string): Promise<number> {
  const fromRedis = await withRedis(async (client) => {
    const val = await client.get(key);
    return val !== null ? Number(val) : 0;
  });
  if (fromRedis !== null) return fromRedis;

  const current = memoryCounters.get(key);
  if (!current || current.resetAt <= Date.now()) return 0;
  return current.count;
}

/** Test-only helper to reset the in-memory maps between cases. */
export function __resetMemoryStore() {
  memoryValues.clear();
  memoryCounters.clear();
}
