import { describe, expect, it } from "vitest";
import { drillDownHref, parseDrillDown } from "@/features/performance/drill-down";

const paramsOf = (query: string) => new URLSearchParams(query);

describe("drillDownHref", () => {
  it("links to the journal in the page language with the window, the breakdown and the encoded row", () => {
    expect(drillDownHref("en", { period: "30d", dimension: "weekday", row: "key:weekday.3" })).toBe("/en/journal?period=30d&dimension=weekday&row=key%3Aweekday.3");
    expect(drillDownHref("fa", { period: "all", dimension: "symbol", row: "text:xauusd" })).toBe("/fa/journal?period=all&dimension=symbol&row=text%3Axauusd");
  });

  it("encodes what could break a URL (spaces, &, #, Persian words) and reads back exactly", () => {
    for (const row of ["text:late entry", "text:a&b=c#d", "text:ورود دیرهنگام", "text:100% sure?"]) {
      const href = drillDownHref("fa", { period: "7d", dimension: "mistake", row });
      expect(parseDrillDown(paramsOf(href.split("?")[1]))).toEqual({ period: "7d", dimension: "mistake", row });
    }
  });
});

describe("parseDrillDown", () => {
  it("reads all three parameters", () => {
    expect(parseDrillDown(paramsOf("period=90d&dimension=session&row=key%3Asession.london"))).toEqual({ period: "90d", dimension: "session", row: "key:session.london" });
  });

  it("is null unless all three are there and valid, so the journal is shown whole", () => {
    for (const query of [
      "",
      "period=30d&dimension=weekday",
      "dimension=weekday&row=key%3Aweekday.3",
      "period=30d&row=key%3Aweekday.3",
      "period=1y&dimension=weekday&row=x",
      "period=30d&dimension=color&row=x",
      "period=30d&dimension=weekday&row=",
      `period=30d&dimension=weekday&row=${"a".repeat(201)}`
    ]) {
      expect(parseDrillDown(paramsOf(query)), query).toBeNull();
    }
  });

  it("is null without any parameters object (outside a router)", () => {
    expect(parseDrillDown(null)).toBeNull();
    expect(parseDrillDown(undefined)).toBeNull();
  });
});
