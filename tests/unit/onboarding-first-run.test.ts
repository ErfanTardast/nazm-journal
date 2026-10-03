import { describe, expect, it } from "vitest";
import { emptyFirstRunState, firstOpenStep, normalizeFirstRunState, type FirstRunState } from "@/lib/onboarding/first-run";

const state = (patch: Partial<FirstRunState>): FirstRunState => ({ ...emptyFirstRunState, ...patch });

describe("firstOpenStep", () => {
  it("starts a new account at the first question", () => {
    expect(firstOpenStep(emptyFirstRunState)).toBe(1);
  });

  it("asks the goal once the platform is known", () => {
    expect(firstOpenStep(state({ tradingPlatform: "mt5" }))).toBe(2);
  });

  it("goes to the history step once both answers are saved", () => {
    expect(firstOpenStep(state({ tradingPlatform: "mt5", primaryGoal: "risk" }))).toBe(3);
  });

  it("counts the history step as done once there are trades of the person's own", () => {
    expect(firstOpenStep(state({ tradingPlatform: "manual", primaryGoal: "risk", hasTrades: true }))).toBe(4);
  });

  it("counts the strategy step as done once there is a strategy", () => {
    expect(firstOpenStep(state({ tradingPlatform: "manual", primaryGoal: "risk", hasTrades: true, hasStrategy: true }))).toBe(5);
  });

  it("does not skip an open step because a later one is done", () => {
    expect(firstOpenStep(state({ tradingPlatform: "mt5", primaryGoal: "risk", hasStrategy: true }))).toBe(3);
    expect(firstOpenStep(state({ hasTrades: true, hasStrategy: true }))).toBe(1);
  });
});

describe("normalizeFirstRunState", () => {
  it("reads the data of GET /api/onboarding/state", () => {
    expect(
      normalizeFirstRunState({
        state: { tradingPlatform: "other", primaryGoal: "strategy", onboardedAt: "2026-10-02T09:30:00.000Z", hasTrades: true, hasStrategy: false, hasPlan: true, hasSample: true }
      })
    ).toEqual({ tradingPlatform: "other", primaryGoal: "strategy", onboardedAt: "2026-10-02T09:30:00.000Z", hasTrades: true, hasStrategy: false, hasPlan: true, hasSample: true });
  });

  it("reads anything else as not yet answered", () => {
    for (const odd of [null, undefined, "x", 3, [], {}, { state: null }, { segment: "beginner-crypto-no_plan", language: "en" }]) {
      expect(normalizeFirstRunState(odd)).toEqual(emptyFirstRunState);
    }
  });

  it("drops an answer that is not one of the choices and a flag that is not true", () => {
    expect(normalizeFirstRunState({ state: { tradingPlatform: "ctrader", primaryGoal: "x", onboardedAt: "", hasTrades: "yes", hasPlan: 1 } })).toEqual(
      emptyFirstRunState
    );
  });
});
