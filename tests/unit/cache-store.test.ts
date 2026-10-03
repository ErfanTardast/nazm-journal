import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetMemoryStore, cacheGet, cacheIncrement, cacheSet } from "@/lib/cache/store";

describe("cache store (memory fallback)", () => {
  beforeEach(() => {
    __resetMemoryStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("round-trips a value", async () => {
    await cacheSet("k1", "hello", 60);
    expect(await cacheGet("k1")).toBe("hello");
  });

  it("returns null for missing keys", async () => {
    expect(await cacheGet("missing")).toBeNull();
  });

  it("expires values after the ttl", async () => {
    vi.useFakeTimers();
    await cacheSet("k2", "v", 1);
    vi.advanceTimersByTime(1500);
    expect(await cacheGet("k2")).toBeNull();
  });

  it("increments counters and reports the running total", async () => {
    expect(await cacheIncrement("c", 60)).toBe(1);
    expect(await cacheIncrement("c", 60)).toBe(2);
    expect(await cacheIncrement("c", 60)).toBe(3);
  });
});
