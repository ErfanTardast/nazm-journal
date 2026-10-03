import { describe, expect, it } from "vitest";
import { POST as positionSize } from "@/app/api/risk/position-size/route";
import { POST as liquidation } from "@/app/api/risk/liquidation/route";
import { POST as calculators } from "@/app/api/risk/calculators/route";

function post(url: string, body: unknown) {
  return new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("risk API routes", () => {
  it("returns standard success envelope for position size", async () => {
    const response = await positionSize(
      new Request("http://localhost/api/risk/position-size", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountBalance: 10000, riskPercent: 1, entryPrice: 100, stopLoss: 95 })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.result.quantity).toBe(20);
  });

  it("returns liquidation estimate", async () => {
    const response = await liquidation(
      new Request("http://localhost/api/risk/liquidation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ side: "short", entryPrice: 100, leverage: 10, maintenanceMarginPercent: 0.5 })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.result.liquidationPrice).toBeCloseTo(109.5);
  });

  // stop == entry means zero risk distance: it used to escape as a 500 "Unexpected server error".
  describe("zero risk distance (stop equals entry)", () => {
    it("position-size answers 422 and names the stop loss field", async () => {
      const response = await positionSize(post("http://localhost/api/risk/position-size", { accountBalance: 10000, riskPercent: 1, entryPrice: 100, stopLoss: 100 }));
      const body = await response.json();

      expect(response.status).toBe(422);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.details.fieldErrors.stopLoss).toEqual([expect.stringMatching(/stop loss must be different from the entry price/i)]);
    });

    it("compares the numbers, not the typed text", async () => {
      const response = await positionSize(post("http://localhost/api/risk/position-size", { accountBalance: "۱۰٬۰۰۰", riskPercent: "۱", entryPrice: "۱۰۰٫۵", stopLoss: "100.50" }));

      expect(response.status).toBe(422);
      expect((await response.json()).error.details.fieldErrors.stopLoss).toBeDefined();
    });

    it("the combined calculators route answers 422 for position size", async () => {
      const response = await calculators(post("http://localhost/api/risk/calculators", { positionSize: { accountBalance: 10000, riskPercent: 1, entryPrice: 100, stopLoss: 100 } }));
      const body = await response.json();

      expect(response.status).toBe(422);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(JSON.stringify(body.error.details)).toMatch(/stop loss must be different from the entry price/i);
    });

    it("the combined calculators route answers 422 for reward/risk", async () => {
      const response = await calculators(post("http://localhost/api/risk/calculators", { rewardRisk: { entryPrice: 100, stopLoss: 100, takeProfit: 110 } }));

      expect(response.status).toBe(422);
      expect(JSON.stringify((await response.json()).error.details)).toMatch(/stop loss must be different from the entry price/i);
    });

    it("still calculates when the stop is on either side of the entry", async () => {
      const long = await calculators(post("http://localhost/api/risk/calculators", { rewardRisk: { entryPrice: 100, stopLoss: 95, takeProfit: 110 } }));
      const short = await calculators(post("http://localhost/api/risk/calculators", { positionSize: { accountBalance: 10000, riskPercent: 1, entryPrice: 100, stopLoss: 105 } }));

      expect(long.status).toBe(200);
      expect((await long.json()).data.result.rewardRisk.rewardRiskRatio).toBe(2);
      expect(short.status).toBe(200);
    });
  });
});
