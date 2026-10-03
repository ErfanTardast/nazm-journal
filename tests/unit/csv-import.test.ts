import { describe, expect, it } from "vitest";
import { mapCsvRow, parseCsv, previewTradeCsv, suggestMapping } from "@/lib/import/csv";

const mapping = {
  symbol: "symbol",
  market: "market",
  side: "side",
  status: "status",
  entryPrice: "entryPrice",
  exitPrice: "exitPrice",
  stopLoss: "stopLoss",
  takeProfit: "takeProfit",
  quantity: "quantity",
  fees: "fees",
  openedAt: "openedAt",
  closedAt: "closedAt"
};

describe("CSV import helpers", () => {
  it("parses CSV rows", () => {
    const rows = parseCsv("symbol,market\nBTCUSDT,crypto");
    expect(rows).toEqual([{ symbol: "BTCUSDT", market: "crypto" }]);
  });

  it("previews valid and invalid trade rows", () => {
    const preview = previewTradeCsv(
      [
        "symbol,market,side,status,entryPrice,exitPrice,stopLoss,takeProfit,quantity,fees,openedAt,closedAt",
        "BTCUSDT,crypto,long,closed,100,110,95,120,1,1,2026-06-10T00:00:00.000Z,2026-06-10T02:00:00.000Z",
        "ES,futures,long,closed,100,110,95,120,1,1,2026-06-10T00:00:00.000Z,2026-06-10T02:00:00.000Z"
      ].join("\n"),
      mapping
    );

    expect(preview[0].isValid).toBe(true);
    expect(preview[1].isValid).toBe(false);
  });

  it("routes journal fields through the mapping instead of raw header names", () => {
    const mapped = mapCsvRow(
      { Feeling: "Anxious", Errors: "fomo|oversize", Labels: "news|breakout", Comment: "Chased entry" },
      { emotionalState: "Feeling", mistakes: "Errors", tags: "Labels", notes: "Comment" }
    ) as { journal: { emotionalState?: string; mistakes: string[]; tags: string[]; notes?: string } };

    expect(mapped.journal.emotionalState).toBe("Anxious");
    expect(mapped.journal.mistakes).toEqual(["fomo", "oversize"]);
    expect(mapped.journal.tags).toEqual(["news", "breakout"]);
    expect(mapped.journal.notes).toBe("Chased entry");
  });

  it("omits empty optional fields so they stay valid", () => {
    const preview = previewTradeCsv(
      [
        "symbol,market,side,entryPrice,exitPrice,quantity,openedAt",
        "BTCUSDT,crypto,long,100,,1,2026-06-10T00:00:00.000Z"
      ].join("\n"),
      { symbol: "symbol", market: "market", side: "side", entryPrice: "entryPrice", exitPrice: "exitPrice", quantity: "quantity", openedAt: "openedAt" }
    );

    expect(preview[0].isValid).toBe(true);
    expect((preview[0].mapped as { exitPrice?: unknown }).exitPrice).toBeUndefined();
  });

  it("keeps a full default-named row valid under strict validation", () => {
    const preview = previewTradeCsv(
      [
        "symbol,market,side,status,entryPrice,exitPrice,stopLoss,takeProfit,quantity,fees,openedAt,closedAt,emotionalState,mistakes,tags,notes",
        "BTCUSDT,crypto,long,closed,100,110,95,120,1,1,2026-06-10T00:00:00.000Z,2026-06-10T02:00:00.000Z,Focused,,breakout|discipline,Followed plan"
      ].join("\n"),
      {
        symbol: "symbol", market: "market", side: "side", status: "status", entryPrice: "entryPrice", exitPrice: "exitPrice",
        stopLoss: "stopLoss", takeProfit: "takeProfit", quantity: "quantity", fees: "fees", openedAt: "openedAt", closedAt: "closedAt",
        emotionalState: "emotionalState", mistakes: "mistakes", tags: "tags", notes: "notes"
      }
    );

    expect(preview[0].errors).toEqual([]);
    expect(preview[0].isValid).toBe(true);
  });

  describe("auto-detection", () => {
    it("matches common broker header aliases case-insensitively", () => {
      const suggestion = suggestMapping(["Ticker", "Direction", "Open Price", "Close Price", "Qty", "Open Time", "Commission"]);
      expect(suggestion.symbol).toBe("Ticker");
      expect(suggestion.side).toBe("Direction");
      expect(suggestion.entryPrice).toBe("Open Price");
      expect(suggestion.exitPrice).toBe("Close Price");
      expect(suggestion.quantity).toBe("Qty");
      expect(suggestion.openedAt).toBe("Open Time");
      expect(suggestion.fees).toBe("Commission");
    });

    it("does not assign one header to two fields", () => {
      const suggestion = suggestMapping(["symbol", "entryPrice", "exitPrice"]);
      const used = Object.values(suggestion);
      expect(new Set(used).size).toBe(used.length);
    });

    it("leaves unknown headers unmapped", () => {
      const suggestion = suggestMapping(["alpha", "beta"]);
      expect(Object.keys(suggestion)).toHaveLength(0);
    });
  });
});

