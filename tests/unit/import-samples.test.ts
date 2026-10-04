import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCsv, previewTradeCsv, suggestMapping } from "@/lib/import/csv";
import { readImportFile } from "@/lib/import/mt5-report";

// The README points strangers at these files to try the import without their own data, so they must keep working.
const samples = join(process.cwd(), "docs/samples");
const bytes = (name: string) => {
  const buffer = readFileSync(join(samples, name));
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
};

describe("docs/samples/mt5-report-sample.html", () => {
  it("is a UTF-16LE file with a BOM, like a real MT5 export", () => {
    const raw = new Uint8Array(bytes("mt5-report-sample.html"));
    expect([raw[0], raw[1]]).toEqual([0xff, 0xfe]);
  });

  it("converts into ten valid journal rows, net of commission and swap", () => {
    const file = readImportFile(bytes("mt5-report-sample.html"));
    expect(file.kind).toBe("mt5");
    if (file.kind !== "mt5") return;
    expect(file.positions).toBe(10);

    const preview = previewTradeCsv(file.csv, file.mapping);
    expect(preview.filter((row) => row.isValid)).toHaveLength(10);

    const rows = parseCsv(file.csv);
    expect(rows[0]).toMatchObject({ symbol: "EURUSD", side: "long", realizedPnl: "156.5", externalId: "mt5:51234567:7700101" });
  });

  it("has one ladder: two legs that share a key", () => {
    const file = readImportFile(bytes("mt5-report-sample.html"));
    if (file.kind !== "mt5") throw new Error(file.kind);
    const legs = parseCsv(file.csv).filter((row) => row.ladderKey);
    expect(legs).toHaveLength(2);
    expect(new Set(legs.map((row) => row.ladderKey)).size).toBe(1);
    expect(legs.map((row) => row.ladderLeg).sort()).toEqual(["1", "2"]);
  });

  it("says it is synthetic", () => {
    const text = new TextDecoder("utf-16le").decode(new Uint8Array(bytes("mt5-report-sample.html")).subarray(2));
    expect(text).toMatch(/Synthetic sample/);
  });
});

describe("docs/samples/trades-sample.csv", () => {
  it("is in the README's CSV format and every row is valid", () => {
    const csv = readFileSync(join(samples, "trades-sample.csv"), "utf8");
    const file = readImportFile(bytes("trades-sample.csv"));
    expect(file.kind).toBe("csv");
    const headers = csv.split(/\r?\n/)[0].split(",");
    const preview = previewTradeCsv(csv, suggestMapping(headers));
    expect(preview).toHaveLength(3);
    expect(preview.every((row) => row.isValid)).toBe(true);
  });
});
