import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); }, useRouter: () => ({ push: vi.fn() }) }));
import RiskPage from "@/app/[locale]/risk/page";
import { PlanRiskDesk } from "@/features/risk/plan-desk";
import { planIdFromQuery } from "@/features/risk/plan-sizing";

async function deskOf(locale: string, plan: string | string[] | undefined) {
  const page = (await RiskPage({ params: Promise.resolve({ locale }), searchParams: Promise.resolve({ plan }) })) as ReactElement<{ children: ReactElement[] }>;
  const desk = page.props.children.find((child) => child.type === PlanRiskDesk) as ReactElement<{ locale: string; planId: string | null }> | undefined;
  return desk;
}

describe("the risk page reads ?plan= and hands the id to the planner", () => {
  it("passes the plan id", async () => {
    const desk = await deskOf("en", "plan_12345");
    expect(desk?.props).toMatchObject({ locale: "en", planId: "plan_12345" });
  });

  it("passes no plan without the query", async () => {
    expect((await deskOf("fa", undefined))?.props).toMatchObject({ locale: "fa", planId: null });
  });

  it("is a 404 for a language it does not have", async () => {
    await expect(deskOf("de", "plan_12345")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("planIdFromQuery", () => {
  it("takes the id, trimmed, and the first one when the query repeats", () => {
    expect(planIdFromQuery("plan_12345")).toBe("plan_12345");
    expect(planIdFromQuery("  plan_12345 ")).toBe("plan_12345");
    expect(planIdFromQuery(["plan_a", "plan_b"])).toBe("plan_a");
  });

  it("is no plan for an empty, missing or absurdly long value", () => {
    expect(planIdFromQuery(undefined)).toBeNull();
    expect(planIdFromQuery("")).toBeNull();
    expect(planIdFromQuery("   ")).toBeNull();
    expect(planIdFromQuery([])).toBeNull();
    expect(planIdFromQuery("x".repeat(129))).toBeNull();
    expect(planIdFromQuery("x".repeat(128))).toBe("x".repeat(128));
  });
});
