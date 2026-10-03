/**
 * MetaTrader 5 trade history report -> the journal's standard import CSV.
 *
 * MT5 exports History > Report as HTML (UTF-16LE) or XLSX, never CSV. This accepts the HTML file as-is or
 * the XLSX saved as CSV (comma, semicolon or tab), finds the Positions table (not Deals or Orders, which
 * would double-count round trips), tells the duplicate Time/Price columns apart (open vs close), skips
 * balance/credit rows, and emits rows the existing importer validates with MT5_IMPORT_MAPPING. The
 * position comment (an EA name or ladder leg such as "1/3"), which the HTML report keeps in a hidden
 * cell, goes into the notes, and legs an EA numbered "k/N" share a ladderKey (with their leg number and
 * size); the entries themselves are formed from open times when metrics run (src/lib/calculations/ladders.ts),
 * so overlapping imports group the same way in any order.
 *
 * The Positions table shows the stop at close, which may have been moved (to break-even, say). The opening
 * order in the Orders table has the same ticket as the position and keeps the initial stop, so stopLoss,
 * risk and R use that; its Comment column also covers XLSX saves, which drop MT5's hidden comment cell.
 * externalId ("mt5:<account>:<position>") lets a re-import of an overlapping report skip known positions.
 *
 * Money fields come from the report because lot-based P&L cannot be rebuilt from prices alone:
 * realizedPnl = Profit + Commission + Swap, and R is taken from price geometry (move / stop distance)
 * with the money risk derived from the reported profit.
 */

export const MT5_HEADERS = [
  "symbol",
  "market",
  "side",
  "status",
  "entryPrice",
  "exitPrice",
  "stopLoss",
  "takeProfit",
  "quantity",
  "fees",
  "realizedPnl",
  "riskAmount",
  "rMultiple",
  "openedAt",
  "closedAt",
  "notes",
  "ladderKey",
  "ladderLeg",
  "ladderSize",
  "externalId"
] as const;

/** Identity mapping for the converted CSV (target field -> column header). */
export const MT5_IMPORT_MAPPING: Record<string, string> = Object.fromEntries(MT5_HEADERS.map((header) => [header, header]));

export type Mt5ConversionResult =
  | { ok: true; csv: string; positions: number; skippedNonTrades: number }
  | { ok: false; code: "no_positions_table" | "no_trades"; message: string };

/** MT5 writes HTML reports as UTF-16LE with a BOM; XLSX-to-CSV saves are usually UTF-8. */
export function decodeReportBytes(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  const sample = bytes.subarray(0, 400);
  let oddZeros = 0;
  for (let i = 1; i < sample.length; i += 2) if (sample[i] === 0) oddZeros++;
  if (sample.length > 20 && oddZeros > sample.length / 4) return new TextDecoder("utf-16le").decode(bytes);
  return new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");
}

const ENTITIES: Record<string, string> = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };

/** One table row: visible cells in column order, plus the text of MT5's hidden cells (the comment). */
type Row = { cells: string[]; comment: string };

function htmlRows(html: string): Row[] {
  return html
    .split(/<tr\b[^>]*>/i)
    .slice(1)
    .map((chunk) => {
      const row = chunk.split(/<\/tr>/i)[0];
      const cells: string[] = [];
      const hidden: string[] = [];
      for (const match of row.matchAll(/<t([dh])\b([^>]*)>([\s\S]*?)<\/t\1>/gi)) {
        const text = match[3]
          .replace(/<[^>]*>/g, "")
          .replace(/&[a-z#0-9]+;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? " ")
          .replace(/\s+/g, " ")
          .trim();
        // A hidden cell is off the column grid (alignment filler, or the position comment).
        if (/class\s*=\s*["']?hidden/i.test(match[2])) hidden.push(text);
        else cells.push(text);
      }
      return { cells, comment: hidden.filter(Boolean).join(" ") };
    });
}

function splitDelimited(line: string, delimiter: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      values.push(current.trim());
      current = "";
    } else current += char;
  }
  values.push(current.trim());
  return values;
}

function delimitedRows(text: string): Row[] {
  const lines = text.split(/\r?\n/);
  const header = lines.find((line) => /position/i.test(line) && /symbol/i.test(line)) ?? lines[0] ?? "";
  const counts = [",", ";", "\t"].map((d) => ({ d, n: header.split(d).length }));
  const delimiter = counts.sort((a, b) => b.n - a.n)[0].d;
  return lines.map((line) => ({ cells: splitDelimited(line, delimiter), comment: "" }));
}

function tableRows(text: string): Row[] {
  return /<table\b/i.test(text) ? htmlRows(text) : delimitedRows(text);
}

const norm = (value: string | undefined) => (value ?? "").toLowerCase().replace(/\s+/g, "");

function findPositionsHeader(rows: Row[]) {
  return rows.findIndex(({ cells }) => {
    const n = cells.map(norm);
    const count = (name: string) => n.filter((cell) => cell === name).length;
    return n[0] === "time" && n.includes("position") && n.includes("symbol") && n.includes("profit") && count("time") >= 2 && count("price") >= 2;
  });
}

/** An MT5 History report of any view, as HTML or saved from its XLSX: the report title, account header or sections. */
function looksLikeMt5Report(text: string) {
  if (/Trade History Report/i.test(text)) return true;
  if (/<table\b/i.test(text)) return /<td[^>]*>\s*Account:\s*<\/td>|<b>\s*(Deals|Orders|Positions)\s*<\/b>/i.test(text);
  return /^Account:[,;\t]/m.test(text) && /^(Deals|Orders|Positions)[,;\t]*$/m.test(text);
}

export function isMt5Report(text: string) {
  return findPositionsHeader(tableRows(text)) !== -1;
}

function parseNumber(raw: string | undefined) {
  let value = (raw ?? "").replace(/[\s\u00a0]/g, "");
  if (value === "") return NaN;
  value = value.includes(",") && !value.includes(".") ? value.replace(",", ".") : value.replace(/,/g, "");
  return Number(value);
}

const DATE = /^(\d{4})\.(\d{2})\.(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/;

/**
 * MT5 prints broker server time as "YYYY.MM.DD HH:MM[:SS]"; kept without a zone here and read in the broker
 * time zone from Settings when imported (csvImportSchema.timeZone).
 */
function parseMt5Date(raw: string | undefined) {
  const match = DATE.exec((raw ?? "").trim());
  return match ? `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6] ?? "00"}` : "";
}

function marketFor(symbol: string) {
  if (/BTC|ETH|USDT|XRP|SOL|DOGE|LTC|BNB|ADA/.test(symbol)) return "crypto";
  if (/^(XAU|XAG)/.test(symbol) || /^[A-Z]{6}/.test(symbol)) return "forex";
  return "stocks";
}

const round = (value: number, digits: number) => Number(value.toFixed(digits));
const out = (value: number) => (Number.isFinite(value) ? String(value) : "");
const csvCell = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/** The login from the report header ("Account: 51234567 (USD, Hedge)"), or "" when absent. */
function readAccount(rows: Row[]) {
  const row = rows.find(({ cells }) => norm(cells[0]) === "account:");
  return /\d+/.exec(row?.cells[1] ?? "")?.[0] ?? "";
}

type OpeningOrder = { stop: number; comment: string };

/** Orders by ticket: an opening order's ticket equals its position id, and its S/L is the initial stop. */
function readOrders(rows: Row[]) {
  const orders = new Map<string, OpeningOrder>();
  const headerIndex = rows.findIndex(({ cells }) => {
    const n = cells.map(norm);
    return n[0] === "opentime" && n.includes("order") && n.includes("s/l");
  });
  if (headerIndex === -1) return orders;
  const header = rows[headerIndex].cells.map(norm);
  const [ticket, sl, comment] = ["order", "s/l", "comment"].map((name) => header.indexOf(name));
  for (const { cells } of rows.slice(headerIndex + 1)) {
    if (!DATE.test((cells[0] ?? "").trim())) break; // end of the Orders section
    const id = cells[ticket] ?? "";
    if (id && !orders.has(id)) orders.set(id, { stop: parseNumber(cells[sl]), comment: comment === -1 ? "" : (cells[comment] ?? "").trim() });
  }
  return orders;
}

export function convertMt5Report(text: string): Mt5ConversionResult {
  const rows = tableRows(text);
  const headerIndex = findPositionsHeader(rows);
  if (headerIndex === -1) {
    return {
      ok: false,
      code: "no_positions_table",
      message: "No Positions table found. In MT5 open History, switch the view to Positions, then Report."
    };
  }

  const header = rows[headerIndex].cells.map(norm);
  const all = (name: string) => header.flatMap((cell, i) => (cell === name ? [i] : []));
  const [openTime, closeTime] = all("time");
  const [entryCol, exitCol] = all("price");
  const col = (name: string) => header.indexOf(name);
  const c = {
    position: col("position"),
    symbol: col("symbol"),
    type: col("type"),
    volume: col("volume"),
    sl: col("s/l"),
    tp: col("t/p"),
    commission: col("commission"),
    swap: col("swap"),
    profit: col("profit")
  };
  const account = readAccount(rows.slice(0, headerIndex));
  const source = account ? `mt5:${account}` : "mt5";
  const orders = readOrders(rows.slice(headerIndex + 1));

  const lines: string[] = [MT5_HEADERS.join(",")];
  let positions = 0;
  let skippedNonTrades = 0;
  for (const { cells, comment: hiddenComment } of rows.slice(headerIndex + 1)) {
    if (!DATE.test((cells[0] ?? "").trim())) break; // end of the Positions section
    const type = norm(cells[c.type]);
    if (type !== "buy" && type !== "sell") {
      skippedNonTrades++;
      continue;
    }

    const position = cells[c.position] ?? "";
    const order = orders.get(position);
    const comment = hiddenComment || order?.comment || "";
    const symbol = (cells[c.symbol] ?? "").toUpperCase();
    const entry = parseNumber(cells[entryCol]);
    const exit = parseNumber(cells[exitCol]);
    const stopAtClose = parseNumber(cells[c.sl]);
    const stop = order && order.stop > 0 ? order.stop : stopAtClose;
    const target = parseNumber(cells[c.tp]);
    const commission = parseNumber(cells[c.commission]) || 0;
    const swap = parseNumber(cells[c.swap]) || 0;
    const profit = parseNumber(cells[c.profit]);
    const direction = type === "buy" ? 1 : -1;

    const realizedPnl = round(profit + commission + swap, 2);
    const fees = round(Math.max(0, -(commission + swap)), 2);
    let riskAmount = NaN;
    let rMultiple = NaN;
    const move = (exit - entry) * direction;
    const stopDistance = Math.abs(entry - stop);
    // Money risk follows from the report's profit and the price geometry; at a zero move or a stop at the
    // entry it is unknown rather than 0.
    if (stop > 0 && stopDistance > 0 && Number.isFinite(move) && move !== 0 && Number.isFinite(profit)) {
      riskAmount = round(Math.abs(profit / (move / stopDistance)), 2);
      if (riskAmount > 0) rMultiple = round(realizedPnl / riskAmount, 4);
      else riskAmount = NaN;
    }

    const movedStop = stopAtClose > 0 && stop > 0 && stopAtClose !== stop ? `SL at close ${out(stopAtClose)}` : "";
    const values = [
      symbol,
      marketFor(symbol),
      type === "buy" ? "long" : "short",
      "closed",
      out(entry),
      out(exit),
      stop > 0 ? out(stop) : "",
      target > 0 ? out(target) : "",
      out(parseNumber(cells[c.volume])),
      out(fees),
      out(realizedPnl),
      out(riskAmount),
      out(rMultiple),
      parseMt5Date(cells[openTime]),
      parseMt5Date(cells[closeTime]),
      [`MT5 position #${position}`, comment, movedStop].filter(Boolean).join(" · ")
    ];
    const ladder = ladderFields(source, symbol, type, stop, comment);
    lines.push([...values, ladder.key, ladder.leg, ladder.size, `${source}:${position}`].map(csvCell).join(","));
    positions++;
  }

  if (positions === 0) return { ok: false, code: "no_trades", message: "The Positions table has no buy or sell rows." };
  return { ok: true, csv: lines.join("\n"), positions, skippedNonTrades };
}

const LEG_COMMENT = /^(.*?)\s*(\d+)\s*\/\s*(\d+)$/;

/**
 * What the legs of one entry share: account, symbol, direction, the EA's "k/N" comment family and the
 * initial stop (legs of a ladder share it, which also keeps two EA instances on one symbol apart). Only
 * numbered legs get a key: without the EA saying so, MT5 cannot tell a split order from separate trades
 * that happen to share a stop, and netting those would hide a real win and a real loss.
 */
function ladderFields(source: string, symbol: string, type: string, stop: number, comment: string) {
  const match = LEG_COMMENT.exec(comment);
  const size = match ? Number(match[3]) : 0;
  const leg = match ? Number(match[2]) : 0;
  if (!match || size < 2 || leg < 1 || leg > size) return { key: "", leg: "", size: "" };
  const initialStop = stop > 0 ? out(stop) : "";
  return { key: `${source}|${symbol}|${type}|${match[1]}/${size}|sl=${initialStop}`, leg: String(leg), size: String(size) };
}

export type ImportFile =
  | { kind: "csv"; csv: string }
  | { kind: "mt5"; csv: string; mapping: Record<string, string>; positions: number; skippedNonTrades: number }
  | { kind: "mt5_error"; code: "no_positions_table" | "no_trades"; message: string };

/** Decode an uploaded file; an MT5 report is converted to the standard CSV, anything else passes through. */
export function readImportFile(buffer: ArrayBuffer): ImportFile {
  const text = decodeReportBytes(buffer);
  if (!isMt5Report(text)) {
    // A report from another MT5 view carries the owner's name and account in its header: refuse it rather than
    // import it as raw CSV rows.
    if (looksLikeMt5Report(text)) {
      return { kind: "mt5_error", code: "no_positions_table", message: "No Positions table found. In MT5 open History, switch the view to Positions, then Report." };
    }
    return { kind: "csv", csv: text };
  }
  const result = convertMt5Report(text);
  if (!result.ok) return { kind: "mt5_error", code: result.code, message: result.message };
  return { kind: "mt5", csv: result.csv, mapping: MT5_IMPORT_MAPPING, positions: result.positions, skippedNonTrades: result.skippedNonTrades };
}
