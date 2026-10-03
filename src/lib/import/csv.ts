import { tradeCreateSchema } from "@/lib/validation/trading";

export function parseCsv(csv: string) {
  const [headerLine, ...lines] = csv.trim().split(/\r?\n/);
  if (!headerLine) return [];
  const headers = splitCsvLine(headerLine).map((header) => header.trim());
  return lines.filter(Boolean).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""])) as Record<string, string>;
  });
}

export function splitCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current);
  return values;
}

// Journal-only targets: valid under `journal` but NOT as top-level trade fields.
// Routing them to the top level would break the strict trade schema.
const journalOnlyTargets = new Set(["emotionalState", "mistakes", "tags", "notes", "review", "screenshotUrl"]);

export function mapCsvRow(row: Record<string, string>, mapping: Record<string, string>) {
  const read = (target: string) => {
    const source = mapping[target];
    if (!source) return "";
    return (row[source] ?? "").trim();
  };

  const mapped: Record<string, unknown> = {};
  for (const target of Object.keys(mapping)) {
    if (journalOnlyTargets.has(target)) continue;
    const value = read(target);
    // Omit empty optional values so they validate as "absent" instead of coercing to 0.
    if (value !== "") mapped[target] = value;
  }

  const splitList = (value: string) => value.split("|").map((item) => item.trim()).filter(Boolean);
  const orUndefined = (value: string) => (value === "" ? undefined : value);

  mapped.journal = {
    emotionalState: orUndefined(read("emotionalState")),
    mistakes: splitList(read("mistakes")),
    tags: splitList(read("tags")),
    notes: orUndefined(read("notes")),
    preTradeNotes: orUndefined(read("preTradeNotes")),
    postTradeNotes: orUndefined(read("postTradeNotes")),
    lessonsLearned: orUndefined(read("lessonsLearned")),
    ruleFollowed: read("ruleFollowed") || "unknown",
    review: orUndefined(read("review"))
  };
  return mapped;
}

// Known aliases for auto-detecting foreign broker/export headers. Order matters:
// more specific targets are matched before broad ones during partial matching.
const fieldAliases: Record<string, string[]> = {
  symbol: ["symbol", "ticker", "instrument", "pair", "asset", "marketsymbol"],
  side: ["side", "direction", "position", "buysell", "action", "longshort"],
  status: ["status", "state"],
  entryPrice: ["entryprice", "entry", "openprice", "priceopen", "fillprice", "avgentry", "averageentry", "open"],
  exitPrice: ["exitprice", "exit", "closeprice", "priceclose", "avgexit", "close"],
  stopLoss: ["stoploss", "stop", "sl"],
  takeProfit: ["takeprofit", "target", "tp"],
  quantity: ["quantity", "qty", "size", "volume", "lots", "shares", "units", "contracts", "amount"],
  fees: ["fees", "fee", "commission", "commissions", "swap"],
  openedAt: ["openedat", "opentime", "opendate", "entrytime", "entrydate", "opendatetime", "datetime", "date", "time"],
  closedAt: ["closedat", "closetime", "closedate", "exittime", "exitdate", "closedatetime"],
  market: ["market", "assetclass", "assettype", "category"],
  session: ["session", "tradingsession"],
  setupType: ["setuptype", "setup", "pattern"],
  emotionalState: ["emotionalstate", "emotion", "mood", "feeling", "psychology"],
  mistakes: ["mistakes", "mistake", "errors"],
  tags: ["tags", "tag", "labels", "label"],
  notes: ["notes", "note", "comment", "comments", "remarks", "description"],
  postTradeNotes: ["posttradenotes", "postnotes"],
  lessonsLearned: ["lessonslearned", "lessons", "learning"],
  ruleFollowed: ["rulefollowed", "rule", "discipline", "followedplan"]
};

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Suggests a target -> source-header mapping by matching normalized headers
 * against known aliases. Exact alias matches win; each header is used once.
 */
export function suggestMapping(headers: string[]): Record<string, string> {
  const normalized = headers.map((raw) => ({ raw, norm: normalizeHeader(raw) })).filter((entry) => entry.norm);
  const used = new Set<string>();
  const result: Record<string, string> = {};

  // Pass 1: exact alias matches.
  for (const [target, aliases] of Object.entries(fieldAliases)) {
    const aliasSet = new Set(aliases);
    const match = normalized.find((entry) => !used.has(entry.raw) && aliasSet.has(entry.norm));
    if (match) {
      result[target] = match.raw;
      used.add(match.raw);
    }
  }

  // Pass 2: partial matches (header contains a known alias of length >= 3).
  for (const [target, aliases] of Object.entries(fieldAliases)) {
    if (result[target]) continue;
    const candidates = aliases.filter((alias) => alias.length >= 3).sort((a, b) => b.length - a.length);
    const match = normalized.find((entry) => !used.has(entry.raw) && candidates.some((alias) => entry.norm.includes(alias)));
    if (match) {
      result[target] = match.raw;
      used.add(match.raw);
    }
  }

  return result;
}

export function previewTradeCsv(csv: string, mapping: Record<string, string>) {
  return parseCsv(csv).map((row, index) => {
    const mapped = mapCsvRow(row, mapping);
    const parsed = tradeCreateSchema.safeParse(mapped);
    return {
      rowNumber: index + 2,
      raw: row,
      mapped,
      isValid: parsed.success,
      errors: parsed.success ? [] : parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    };
  });
}

