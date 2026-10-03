import { describe, expect, it } from "vitest";
import { clusterLadders, entryLegIds } from "@/lib/calculations/ladders";

const at = (seconds: number) => new Date(Date.UTC(2026, 7, 29, 20, 4, 44) + seconds * 1000);
const leg = (key: string | null, seconds: number, ladderLeg?: number) => ({ ladderKey: key, ladderLeg, openedAt: at(seconds) });

describe("clusterLadders", () => {
  it("puts legs with one key opened within the window into one entry", () => {
    expect(clusterLadders([leg("A", 0, 1), leg("A", 1, 2), leg("A", 1, 3), leg("A", 7200, 1)])).toEqual([0, 0, 0, 1]);
  });

  it("starts a new entry when a leg number repeats", () => {
    expect(clusterLadders([leg("A", 0, 1), leg("A", 0, 2), leg("A", 5, 1), leg("A", 5, 2)])).toEqual([0, 0, 1, 1]);
  });

  it("never joins different keys", () => {
    expect(clusterLadders([leg("A", 0, 1), leg("B", 0, 2)])).toEqual([0, 1]);
  });

  it("anchors the window at the entry's first leg", () => {
    expect(clusterLadders([leg("S", 0), leg("S", 9), leg("S", 15)])).toEqual([0, 0, 1]);
  });

  it("groups the same way whatever order the legs were stored in", () => {
    // Legs 2 and 3 imported from an earlier report, leg 1 from a later one.
    const stored = [leg("A", 1, 2), leg("A", 1, 3), leg("A", 0, 1)];
    const clusters = clusterLadders(stored);

    expect(new Set(clusters).size).toBe(1);
  });

  it("stays fast when many same-numbered legs share a key inside the window", () => {
    // A looping EA or a numbering glitch: 40,000 "1/N" legs within 9 seconds. Each becomes its own entry,
    // and the scan for an entry to join is bounded, so this is not quadratic.
    const legs = Array.from({ length: 40_000 }, (_, i) => leg("A", (i % 9000) / 1000, 1));
    const started = performance.now();
    const clusters = clusterLadders(legs);

    expect(new Set(clusters).size).toBe(40_000);
    expect(performance.now() - started).toBeLessThan(1500);
  });

  it("leaves trades without a key or open time out", () => {
    expect(clusterLadders([leg(null, 0), { ladderKey: "A", openedAt: undefined }, leg("A", 0)])).toEqual([-1, -1, 0]);
  });
});

describe("entryLegIds", () => {
  it("lists every leg of a trade's entry, and a lone trade by itself", () => {
    const legs = entryLegIds([
      { id: "a1", ...leg("A", 0, 1) },
      { id: "s", ...leg(null, 0) },
      { id: "a2", ...leg("A", 1, 2) }
    ]);

    expect(legs.get("a1")).toEqual(["a1", "a2"]);
    expect(legs.get("a2")).toEqual(["a1", "a2"]);
    expect(legs.get("s")).toEqual(["s"]);
  });
});
