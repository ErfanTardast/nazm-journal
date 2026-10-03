import { describe, expect, it } from "vitest";
import { convertMt5Report, decodeReportBytes, isMt5Report, MT5_IMPORT_MAPPING, readImportFile } from "@/lib/import/mt5-report";
import { parseCsv, previewTradeCsv } from "@/lib/import/csv";

// Shape of an MT5 "History > Report > XLSX" opened and saved as CSV: account block on top, the Positions
// table with duplicate Time/Price headers, a balance row, then the Orders section.
const CSV_REPORT = [
  "Trade History Report,,,,,,,,,,,,",
  "Name:,Sample Trader,,,,,,,,,,,",
  "Account:,51234567 (USD, Demo),,,,,,,,,,,",
  "Positions,,,,,,,,,,,,",
  "Time,Position,Symbol,Type,Volume,Price,S / L,T / P,Time,Price,Commission,Swap,Profit",
  "2026.09.15 10:23:45,1001,EURUSD,buy,0.5,1.10000,1.09800,1.10600,2026.09.15 14:02:10,1.10400,-3.50,0.00,200.00",
  "2026.09.16 09:00:00,1002,XAUUSD,sell,0.1,2650.50,,,2026.09.16 11:30:00,2655.50,-0.70,-1.20,-50.00",
  "2026.09.16 12:00:00,1003,,balance,,,,,,,,,1 000.00",
  ",,,,,,,,,,,,",
  "Orders,,,,,,,,,,,,",
  "Open Time,Order,Symbol,Type,Volume,Price,S / L,T / P,Time,State,Comment,,"
].join("\r\n");

const HTML_REPORT = `<html><body><table>
<tr><td colspan=13><div><b>Positions</b></div></td></tr>
<tr bgcolor="#E5F0FC"><td nowrap><b>Time</b></td><td><b>Position</b></td><td><b>Symbol</b></td><td><b>Type</b></td>
<td class="hidden" colspan="8"></td><td><b>Volume</b></td><td><b>Price</b></td><td><b>S / L</b></td><td><b>T / P</b></td>
<td><b>Time</b></td><td><b>Price</b></td><td><b>Commission</b></td><td><b>Swap</b></td><td><b>Profit</b></td></tr>
<tr bgcolor=#FFFFFF align=right><td>2026.09.15 10:23:45</td><td>1001</td><td>EURUSD</td><td>buy</td><td class="hidden" colspan="8"></td>
<td>0.5</td><td>1.10000</td><td>1.09800</td><td>1.10600</td><td>2026.09.15 14:02:10</td><td>1.10400</td><td>-3.50</td><td>0.00</td><td>200.00</td></tr>
<tr><td colspan=13>&nbsp;</td></tr>
<tr><td colspan=13><div><b>Orders</b></div></td></tr>
</table></body></html>`;

describe("isMt5Report", () => {
  it("recognizes the Positions table in CSV and HTML reports", () => {
    expect(isMt5Report(CSV_REPORT)).toBe(true);
    expect(isMt5Report(HTML_REPORT)).toBe(true);
  });

  it("does not claim an ordinary journal CSV", () => {
    expect(isMt5Report("symbol,side,entryPrice\nBTCUSDT,long,60000")).toBe(false);
  });
});

describe("convertMt5Report", () => {
  it("turns closed positions into journal rows and skips balance rows", () => {
    const result = convertMt5Report(CSV_REPORT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.positions).toBe(2);
    expect(result.skippedNonTrades).toBe(1);

    const [eurusd, gold] = parseCsv(result.csv);
    expect(eurusd).toMatchObject({
      symbol: "EURUSD",
      market: "forex",
      side: "long",
      status: "closed",
      entryPrice: "1.1",
      exitPrice: "1.104",
      stopLoss: "1.098",
      takeProfit: "1.106",
      quantity: "0.5",
      openedAt: "2026-09-15T10:23:45",
      closedAt: "2026-09-15T14:02:10",
      realizedPnl: "196.5",
      fees: "3.5",
      notes: "MT5 position #1001",
      // Account number from the report header keeps ids distinct across accounts.
      externalId: "mt5:51234567:1001",
      // No "k/N" comment, so no ladder: MT5 alone cannot tell a split order from separate trades.
      ladderKey: "",
      ladderLeg: "",
      ladderSize: ""
    });
    // R from price geometry: +0.004 on a 0.002 stop is 2R gross; risk in money is 200 / 2 = 100.
    expect(Number(eurusd.riskAmount)).toBeCloseTo(100, 6);
    expect(Number(eurusd.rMultiple)).toBeCloseTo(1.965, 6);

    expect(gold).toMatchObject({ symbol: "XAUUSD", side: "short", stopLoss: "", takeProfit: "", realizedPnl: "-51.9", fees: "1.9" });
    expect(gold.rMultiple).toBe("");
  });

  it("reads the HTML report, ignoring MT5's hidden alignment cells", () => {
    const result = convertMt5Report(HTML_REPORT);
    expect(result.ok && result.positions).toBe(1);
    const [row] = result.ok ? parseCsv(result.csv) : [];
    expect(row).toMatchObject({ symbol: "EURUSD", side: "long", quantity: "0.5", exitPrice: "1.104", realizedPnl: "196.5" });
  });

  it("keeps the position comment MT5 puts in a hidden cell (markup of a real report)", () => {
    // Markup as a real MT5 HTML report writes it: no hidden cell in the header, the order comment in a
    // hidden colspan cell on each row, and Profit spanning two columns. Values altered.
    const real = `<table>
<tr align="center"> <th colspan="14" style="height: 25px"><div style="font: 10pt Tahoma"><b>Positions</b></div></th> </tr>
<tr align="center" bgcolor="#E5F0FC"> <td nowrap style="height: 30px"><b>Time</b></td> <td nowrap><b>Position</b></td> <td nowrap><b>Symbol</b></td> <td nowrap><b>Type</b></td> <td nowrap><b>Volume</b></td> <td nowrap><b>Price</b></td> <td nowrap><b>S / L</b></td> <td nowrap><b>T / P</b></td> <td nowrap><b>Time</b></td> <td nowrap><b>Price</b></td> <td nowrap><b>Commission</b></td> <td nowrap><b>Swap</b></td> <td nowrap colspan="2"><b>Profit</b></td> </tr>
<tr bgcolor="#FFFFFF" align="right"> <td>2026.08.29 20:04:44</td> <td>900001</td> <td>BTCUSD</td> <td>buy</td> <td class="hidden" colspan="8">Ladder EA 1/3</td> <td class="">0.07</td> <td class="">78000</td> <td class="">77500</td> <td class="">78600</td> <td class="">2026.08.29 20:09:57</td> <td class="">78100</td> <td class="">-2.19</td> <td class="">0.00</td> <td colspan="2">7.00</td> </tr>
<tr bgcolor="#F7F7F7" align="right"> <td>2026.08.29 20:04:45</td> <td>900002</td> <td>BTCUSD</td> <td>buy</td> <td class="hidden" colspan="8"></td> <td class="">0.07</td> <td class="">78000</td> <td class="">77500</td> <td class="">79200</td> <td class="">2026.08.29 20:09:58</td> <td class="">77500</td> <td class="">-2.19</td> <td class="">0.00</td> <td colspan="2">-35.00</td> </tr>
<tr align="center"> <th colspan="14" style="height: 25px"><div style="font: 10pt Tahoma"><b>Orders</b></div></th> </tr>
</table>`;
    const result = convertMt5Report(real);
    expect(result.ok && result.positions).toBe(2);
    const [win, loss] = result.ok ? parseCsv(result.csv) : [];

    expect(win).toMatchObject({ symbol: "BTCUSD", market: "crypto", entryPrice: "78000", exitPrice: "78100", realizedPnl: "4.81", notes: "MT5 position #900001 · Ladder EA 1/3" });
    expect(loss).toMatchObject({ realizedPnl: "-37.19", rMultiple: "-1.0626", notes: "MT5 position #900002" });
  });

  it("handles a semicolon-delimited CSV from a European Excel", () => {
    const result = convertMt5Report(CSV_REPORT.replace(/,/g, ";").replace("1 000.00", "1000"));
    expect(result.ok && result.positions).toBe(2);
  });

  it("produces rows the existing importer validates with the preset mapping", () => {
    const result = convertMt5Report(CSV_REPORT);
    const preview = previewTradeCsv(result.ok ? result.csv : "", MT5_IMPORT_MAPPING);
    expect(preview).toHaveLength(2);
    expect(preview.every((row) => row.isValid)).toBe(true);
  });

  it("explains a report that has no Positions table (e.g. the Deals view)", () => {
    const deals = "Time,Deal,Symbol,Type,Direction,Volume,Price,Order,Commission,Fee,Swap,Profit,Balance,Comment\n";
    expect(convertMt5Report(deals)).toMatchObject({ ok: false, code: "no_positions_table" });
  });
});

describe("decodeReportBytes", () => {
  it("decodes the UTF-16LE files MT5 writes", () => {
    const text = "Time,Position,Symbol";
    const bytes = new Uint8Array(2 + text.length * 2);
    bytes.set([0xff, 0xfe]);
    for (let i = 0; i < text.length; i++) bytes[2 + i * 2] = text.charCodeAt(i);
    expect(decodeReportBytes(bytes.buffer)).toBe(text);
  });

  it("decodes UTF-8 and strips a BOM", () => {
    const bytes = new TextEncoder().encode("﻿symbol,side");
    expect(decodeReportBytes(bytes.buffer as ArrayBuffer)).toBe("symbol,side");
  });
});

describe("readImportFile", () => {
  const bytes = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;

  it("converts an MT5 report and returns the preset mapping", () => {
    const result = readImportFile(bytes(CSV_REPORT));
    expect(result).toMatchObject({ kind: "mt5", positions: 2, skippedNonTrades: 1, mapping: MT5_IMPORT_MAPPING });
    expect(result.kind === "mt5" && result.csv.startsWith("symbol,market,side")).toBe(true);
  });

  it("passes an ordinary CSV through untouched", () => {
    expect(readImportFile(bytes("symbol,side\nBTCUSDT,long"))).toEqual({ kind: "csv", csv: "symbol,side\nBTCUSDT,long" });
  });

  it("reports an MT5 file whose Positions view has no trades", () => {
    const empty = CSV_REPORT.split("\r\n").slice(0, 5).join("\r\n");
    expect(readImportFile(bytes(empty))).toMatchObject({ kind: "mt5_error", code: "no_trades" });
  });
});

describe("ladder keys", () => {
  type Leg = { time: string; id: string; comment: string; sl?: string; symbol?: string; type?: string };
  // Real-report markup: the comment sits in a hidden colspan cell, Profit spans two columns.
  const report = (legs: Leg[]) => `<table>
<tr align="center"> <th colspan="14"><div><b>Positions</b></div></th> </tr>
<tr align="center" bgcolor="#E5F0FC"> <td nowrap><b>Time</b></td> <td nowrap><b>Position</b></td> <td nowrap><b>Symbol</b></td> <td nowrap><b>Type</b></td> <td nowrap><b>Volume</b></td> <td nowrap><b>Price</b></td> <td nowrap><b>S / L</b></td> <td nowrap><b>T / P</b></td> <td nowrap><b>Time</b></td> <td nowrap><b>Price</b></td> <td nowrap><b>Commission</b></td> <td nowrap><b>Swap</b></td> <td nowrap colspan="2"><b>Profit</b></td> </tr>
${legs
  .map(
    (leg) =>
      `<tr bgcolor="#FFFFFF" align="right"> <td>${leg.time}</td> <td>${leg.id}</td> <td>${leg.symbol ?? "BTCUSD"}</td> <td>${leg.type ?? "buy"}</td> <td class="hidden" colspan="8">${leg.comment}</td> <td class="">0.05</td> <td class="">78000</td> <td class="">${leg.sl ?? "77500"}</td> <td class="">78600</td> <td class="">2026.08.29 21:00:00</td> <td class="">78100</td> <td class="">-1.50</td> <td class="">0.00</td> <td colspan="2">5.00</td> </tr>`
  )
  .join("\n")}
<tr align="center"> <th colspan="14"><div><b>Orders</b></div></th> </tr>
</table>`;
  const ladderOf = (legs: Leg[]) => {
    const result = convertMt5Report(report(legs));
    return result.ok ? parseCsv(result.csv).map((row) => [row.ladderKey, row.ladderLeg, row.ladderSize]) : [];
  };

  it("gives numbered legs one key per comment family, with their leg number and size", () => {
    // Which entry each leg belongs to is decided from open times when metrics run (clusterLadders), so a
    // later report that adds a missing leg joins the same entry whatever was imported first.
    const key = "mt5|BTCUSD|buy|RMEA H/3|sl=77500";
    expect(
      ladderOf([
        { time: "2026.08.29 20:04:44", id: "1001", comment: "RMEA H 1/3" },
        { time: "2026.08.29 20:04:45", id: "1002", comment: "RMEA H 2/3" },
        { time: "2026.08.29 20:04:45", id: "1003", comment: "RMEA H 3/3" },
        { time: "2026.08.29 22:10:00", id: "1004", comment: "RMEA H 1/3" }
      ])
    ).toEqual([
      [key, "1", "3"],
      [key, "2", "3"],
      [key, "3", "3"],
      [key, "1", "3"]
    ]);
  });

  it("keeps directions, symbols and comment families apart", () => {
    const keys = ladderOf([
      { time: "2026.08.29 20:04:44", id: "1001", comment: "EA 1/2" },
      { time: "2026.08.29 20:04:44", id: "1002", comment: "EA 2/2", type: "sell" },
      { time: "2026.08.29 20:04:44", id: "1003", comment: "EA 2/2", symbol: "ETHUSD" },
      { time: "2026.08.29 20:04:44", id: "1004", comment: "Other 2/2" }
    ]).map(([key]) => key);

    expect(new Set(keys).size).toBe(4);
  });

  it("gives no key to positions the EA did not number, even with the same stop and timing", () => {
    // Two separate trades with a shared round-number stop must not be netted into one entry.
    expect(
      ladderOf([
        { time: "2026.08.29 20:04:44", id: "1001", comment: "" },
        { time: "2026.08.29 20:04:47", id: "1002", comment: "" },
        { time: "2026.08.29 20:04:48", id: "1003", comment: "manual" }
      ])
    ).toEqual([
      ["", "", ""],
      ["", "", ""],
      ["", "", ""]
    ]);
  });

  it("keeps two numbered entries apart when their initial stops differ", () => {
    // Two EA instances on one symbol can open "1/2" legs in the same seconds; the ladder shares one stop.
    const keys = ladderOf([
      { time: "2026.08.29 20:04:44", id: "1001", comment: "EA 1/2", sl: "77500" },
      { time: "2026.08.29 20:04:45", id: "1002", comment: "EA 1/2", sl: "77400" }
    ]).map(([key]) => key);

    expect(keys[0]).not.toBe(keys[1]);
  });

  it("produces keyed rows the importer accepts", () => {
    const result = convertMt5Report(
      report([
        { time: "2026.08.29 20:04:44", id: "1001", comment: "RMEA H 1/2" },
        { time: "2026.08.29 20:04:45", id: "1002", comment: "RMEA H 2/2" }
      ])
    );
    const preview = previewTradeCsv(result.ok ? result.csv : "", MT5_IMPORT_MAPPING);

    expect(preview.every((row) => row.isValid)).toBe(true);
    // The preview shows the mapped CSV values; the schema turns them into numbers on import.
    expect(preview.map((row) => (row.mapped as { ladderLeg?: string }).ladderLeg)).toEqual(["1", "2"]);
  });
});

describe("the opening order (Orders table)", () => {
  // XLSX saved as CSV: no hidden cells, so the comment only exists in the Orders table.
  const withOrders = (positions: string[], orders: string[]) =>
    [
      "Trade History Report,,,,,,,,,,,,",
      "Account:,7001 (USD, Hedge),,,,,,,,,,,",
      "Positions,,,,,,,,,,,,",
      "Time,Position,Symbol,Type,Volume,Price,S / L,T / P,Time,Price,Commission,Swap,Profit",
      ...positions,
      ",,,,,,,,,,,,",
      "Orders,,,,,,,,,,,,",
      "Open Time,Order,Symbol,Type,Volume,Price,S / L,T / P,Time,State,Comment,,",
      ...orders,
      ",,,,,,,,,,,,",
      "Deals,,,,,,,,,,,,"
    ].join("\r\n");
  const rowsOf = (csv: string) => {
    const result = convertMt5Report(csv);
    return result.ok ? parseCsv(result.csv) : [];
  };

  it("takes the initial stop from the opening order and R from it, noting a moved stop", () => {
    // Stop moved to break-even (78000) before the TP fill; the order kept the initial 77500.
    const [row] = rowsOf(
      withOrders(
        ["2026.08.29 20:04:44,1001,BTCUSD,buy,0.1,78000,78000,78600,2026.08.29 21:00:00,78600,-2.00,0.00,60.00"],
        [
          "2026.08.29 20:04:44,1001,BTCUSD,buy,0.1 / 0.1,market,77500,78600,2026.08.29 20:04:44,filled,EA 1/1",
          "2026.08.29 21:00:00,1002,BTCUSD,sell,0.1 / 0.1,market,,,2026.08.29 21:00:00,filled,"
        ]
      )
    );

    expect(row).toMatchObject({ stopLoss: "77500", realizedPnl: "58", notes: "MT5 position #1001 · EA 1/1 · SL at close 78000", externalId: "mt5:7001:1001" });
    // +600 on a 500 stop is 1.2R gross, so the money risk is 60 / 1.2 = 50 and net R is 58 / 50.
    expect(Number(row.riskAmount)).toBeCloseTo(50, 6);
    expect(Number(row.rMultiple)).toBeCloseTo(1.16, 6);
  });

  it("keys legs from the Orders comments and records the ladder size", () => {
    const rows = rowsOf(
      withOrders(
        [
          "2026.08.29 20:04:44,1001,BTCUSD,buy,0.07,78051,77557,78658,2026.08.29 20:30:00,78658,-2.19,0.00,42.49",
          "2026.08.29 20:04:45,1002,BTCUSD,buy,0.07,78051,77557,79266,2026.08.29 21:30:00,79266,-2.19,0.00,85.05"
        ],
        [
          "2026.08.29 20:04:44,1001,BTCUSD,buy,0.07 / 0.07,market,77557,78658,2026.08.29 20:04:44,filled,RMEA H 1/3",
          "2026.08.29 20:04:44,1002,BTCUSD,buy,0.07 / 0.07,market,77557,79266,2026.08.29 20:04:45,filled,RMEA H 2/3"
        ]
      )
    );

    // Leg 3/3 is still open, so it is not in the report; the size says the entry is incomplete.
    expect(rows.map((row) => [row.ladderKey, row.ladderLeg, row.ladderSize])).toEqual([
      ["mt5:7001|BTCUSD|buy|RMEA H/3|sl=77557", "1", "3"],
      ["mt5:7001|BTCUSD|buy|RMEA H/3|sl=77557", "2", "3"]
    ]);
    expect(rows[0].notes).toBe("MT5 position #1001 · RMEA H 1/3");
  });

  it("keys numbered legs on their initial stop even after the stops moved", () => {
    const rows = rowsOf(
      withOrders(
        [
          "2026.08.29 20:04:44,1001,BTCUSD,buy,0.05,78000,77500,78500,2026.08.29 20:30:00,78500,-1.50,0.00,25.00",
          "2026.08.29 20:04:45,1002,BTCUSD,buy,0.05,78000,78000,79000,2026.08.29 21:30:00,78000,-1.50,0.00,0.00"
        ],
        [
          "2026.08.29 20:04:44,1001,BTCUSD,buy,0.05 / 0.05,market,77500,78500,2026.08.29 20:04:44,filled,EA 1/2",
          "2026.08.29 20:04:45,1002,BTCUSD,buy,0.05 / 0.05,market,77500,79000,2026.08.29 20:04:45,filled,EA 2/2"
        ]
      )
    );

    expect(rows.map((row) => row.ladderKey)).toEqual(["mt5:7001|BTCUSD|buy|EA/2|sl=77500", "mt5:7001|BTCUSD|buy|EA/2|sl=77500"]);
    expect(rows.map((row) => row.ladderSize)).toEqual(["2", "2"]);
  });

  it("leaves the money risk empty rather than 0 when the stop is at the entry", () => {
    const [row] = rowsOf(withOrders(["2026.08.29 20:04:44,1001,BTCUSD,buy,0.1,78000,78000,78600,2026.08.29 21:00:00,78600,-2.00,0.00,60.00"], []));

    expect(row.riskAmount).toBe("");
    expect(row.rMultiple).toBe("");
  });
});

describe("files that look like an MT5 report but are not the Positions view", () => {
  it("are refused instead of being imported raw (the header holds the owner's name and account)", () => {
    const deals = `<html><body><table>
<tr><td>Name:</td><td>Someone</td></tr>
<tr><td>Account:</td><td>51234567 (USD, Hedge)</td></tr>
<tr><th colspan="13"><b>Deals</b></th></tr>
<tr><td>Time</td><td>Deal</td><td>Symbol</td><td>Type</td><td>Direction</td><td>Volume</td><td>Price</td></tr>
</table></body></html>`;
    const bytes = new TextEncoder().encode(deals).buffer as ArrayBuffer;

    expect(readImportFile(bytes)).toMatchObject({ kind: "mt5_error", code: "no_positions_table" });
  });
});

describe("an MT5 report of another view saved as CSV", () => {
  it("is refused too, not imported as raw rows", () => {
    const deals = [
      "Trade History Report,,,,,,,,,,,,",
      "Name:,Someone,,,,,,,,,,,",
      "Account:,51234567 (USD, Demo),,,,,,,,,,,",
      "Deals,,,,,,,,,,,,",
      "Time,Deal,Symbol,Type,Direction,Volume,Price,Order,Commission,Swap,Profit,Balance,Comment",
      "2026.09.15 10:23:45,500001,EURUSD,buy,in,0.5,1.10000,1001,-3.50,0.00,0.00,10000.00,"
    ].join("\r\n");
    const bytes = new TextEncoder().encode(deals).buffer as ArrayBuffer;

    expect(readImportFile(bytes)).toMatchObject({ kind: "mt5_error", code: "no_positions_table" });
  });

  it("still passes an ordinary journal CSV through", () => {
    const csv = "symbol,side,entryPrice\nBTCUSDT,long,60000";
    const bytes = new TextEncoder().encode(csv).buffer as ArrayBuffer;

    expect(readImportFile(bytes)).toEqual({ kind: "csv", csv });
  });
});
