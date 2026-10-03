import { describe, expect, it } from "vitest";
import { onlyMarket, strategyChecklistItems } from "@/features/trade-plans/strategy-link";

const strategy = (checklist: string[]) => ({ id: "s1", name: "Range fade", checklist });
const BUILT_IN = ["News context checked", "Risk amount calculated", "Strategy / playbook matched"];

describe("strategyChecklistItems", () => {
  it("makes one item per line, under the strategy prefix, trimmed, without blanks or repeats", () => {
    expect(strategyChecklistItems(strategy(["  Waited for the sweep ", "", "Volume confirmed", "Waited for the sweep", "   "]))).toEqual([
      { key: "strategy:Waited for the sweep", label: "Waited for the sweep" },
      { key: "strategy:Volume confirmed", label: "Volume confirmed" }
    ]);
  });

  it("gives nothing without a strategy or a checklist", () => {
    expect(strategyChecklistItems(null)).toEqual([]);
    expect(strategyChecklistItems(undefined)).toEqual([]);
    expect(strategyChecklistItems({ id: "s1", name: "Old row" })).toEqual([]);
  });

  it("skips an item the plan form already asks as a built-in tick box, whatever its case or spacing", () => {
    const items = strategyChecklistItems(strategy(["news context checked", "  RISK AMOUNT CALCULATED  ", "Strategy / playbook matched", "Volume confirmed"]), BUILT_IN);
    expect(items.map((item) => item.label)).toEqual(["Volume confirmed"]);
  });

  it("keeps every item when no built-in labels are given, and an item that only contains a built-in label", () => {
    expect(strategyChecklistItems(strategy(["News context checked"])).map((item) => item.label)).toEqual(["News context checked"]);
    expect(strategyChecklistItems(strategy(["News context checked twice"]), BUILT_IN).map((item) => item.label)).toEqual(["News context checked twice"]);
  });
});

describe("onlyMarket", () => {
  it("is the market only when the strategy allows exactly one", () => {
    expect(onlyMarket({ id: "s1", name: "A", allowedMarkets: ["forex"] })).toBe("forex");
    expect(onlyMarket({ id: "s1", name: "A", allowedMarkets: ["forex", "crypto"] })).toBeNull();
    expect(onlyMarket(null)).toBeNull();
  });
});
