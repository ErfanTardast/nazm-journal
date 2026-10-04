// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { mapCsvRow, parseCsv } from "@/lib/import/csv";
import { MT5_IMPORT_MAPPING, readImportFile } from "@/lib/import/mt5-report";
import { csvImportSchema, tradeCreateSchema } from "@/lib/validation/trading";

// docs/API.md is what a developer reads before calling the API, so it has to match the route files: every method of
// every route, who may call it, which routes exist only when payments or demo mode are on, and the names it quotes
// (the session cookie, the error codes). This reads the code and the document and compares them; it never calls a route.

const root = process.cwd();
const apiDir = join(root, "src/app/api");
const doc = readFileSync(join(root, "docs/API.md"), "utf8").replace(/\r\n/g, "\n");

/** Route folders that are not part of the documented API. */
const NOT_DOCUMENTED: string[] = [];

type Facts = { access: "public" | "session" | "admin"; payments: boolean; demo: boolean };

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

/** `src/app/api/reviews/[id]/reminder/route.ts` -> `/api/reviews/:id/reminder`, the way the document writes it. */
function routePath(file: string) {
  const folder = relative(apiDir, file).split(sep).slice(0, -1);
  return `/api/${folder.map((part) => part.replace(/^\[(.+)\]$/, ":$1")).join("/")}`;
}

/** What the code says about every documented route, keyed "METHOD /api/path". */
function routesInCode() {
  const found = new Map<string, Facts>();
  for (const file of walk(apiDir).filter((path) => path.endsWith(`${sep}route.ts`))) {
    const folder = relative(apiDir, file).split(sep)[0];
    if (NOT_DOCUMENTED.includes(folder)) continue;
    const source = readFileSync(file, "utf8");
    const path = routePath(file);
    const facts: Facts = {
      access: path.startsWith("/api/admin/") ? "admin" : /\brequire(Admin)?User\(/.test(source) ? "session" : "public",
      payments: source.includes("requirePaymentsEnabled("),
      demo: source.includes("demoModeEnabled(")
    };
    for (const match of source.matchAll(/^export (?:async function|function|const) (GET|POST|PUT|PATCH|DELETE)\b/gm)) {
      found.set(`${match[1]} ${path}`, facts);
    }
  }
  return found;
}

type DocRow = { access: string; group: string };

/** The rows of the route tables: `| GET, POST | `/api/alerts` | session | What it does |`, with the ### heading above. */
function routesInDoc() {
  const rows = new Map<string, DocRow>();
  let group = "";
  for (const line of doc.split("\n")) {
    if (line.startsWith("### ")) group = line.slice(4).trim();
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    const path = /^`(\/api\/[^`]+)`$/.exec(cells[1] ?? "")?.[1];
    if (!path || !/^[A-Z]+(, [A-Z]+)*$/.test(cells[0])) continue;
    for (const method of cells[0].split(", ")) rows.set(`${method} ${path}`, { access: cells[2], group });
  }
  return rows;
}

/** Every text file under src, read once, for the names the document quotes. */
function sourceText() {
  return walk(join(root, "src"))
    .filter((file) => /\.(ts|tsx)$/.test(file))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
}

describe("docs/API.md matches the route files", () => {
  const inCode = routesInCode();
  const inDoc = routesInDoc();

  it("reads the routes it compares (the check below can fail)", () => {
    expect(inCode.size).toBeGreaterThan(60);
    expect(inCode.has("POST /api/auth/login")).toBe(true);
    expect(inCode.has("DELETE /api/users/me")).toBe(true);
    expect(inCode.has("GET /api/reviews/:id/reminder")).toBe(false);
    expect(routePath(join(apiDir, "reviews", "[id]", "reminder", "route.ts"))).toBe("/api/reviews/:id/reminder");
  });

  it("lists every method of every route, and no route the code does not have", () => {
    const missing = [...inCode.keys()].filter((key) => !inDoc.has(key));
    const invented = [...inDoc.keys()].filter((key) => !inCode.has(key));
    expect({ missing, invented }).toEqual({ missing: [], invented: [] });
  });

  it("says who may call each route, the way the code checks it", () => {
    const wrong = [...inCode]
      .filter(([key, facts]) => inDoc.has(key) && inDoc.get(key)?.access !== facts.access)
      .map(([key, facts]) => `${key}: the code needs ${facts.access}, the document says ${inDoc.get(key)?.access}`);
    expect(wrong).toEqual([]);
  });

  it("puts the payment routes and the demo route under the headings that say when they exist", () => {
    const wrong = [...inCode]
      .filter(([key]) => inDoc.has(key))
      .flatMap(([key, facts]) => {
        const group = inDoc.get(key)?.group ?? "";
        const paymentsHeading = group.includes("NEXT_PUBLIC_PAYMENTS_ENABLED");
        const demoHeading = /demo builds only/i.test(group);
        return [
          ...(facts.payments !== paymentsHeading ? [`${key}: payments routes belong under the payments heading, others do not`] : []),
          ...(facts.demo !== demoHeading ? [`${key}: demo routes belong under the demo heading, others do not`] : [])
        ];
      });
    expect(wrong).toEqual([]);
  });

  it("does not describe the route folders it leaves out", () => {
    for (const folder of NOT_DOCUMENTED) expect(doc).not.toContain(folder);
  });
});

describe("docs/API.md tells a caller how to call the API", () => {
  it("names the session cookie the code sets", () => {
    const cookie = /SESSION_COOKIE = "([^"]+)"/.exec(readFileSync(join(root, "src/lib/auth/session.ts"), "utf8"))?.[1];
    expect(cookie).toBe("nazm_session");
    expect(doc).toContain(`\`${cookie}\``);
  });

  it("covers the JSON body rule, the two-factor code, the answer envelope, rate limits and the MT5 path", () => {
    for (const text of ["application/json", "totpCode", "TWO_FACTOR_REQUIRED", '{ "data"', '{ "error"', "429", "RATE_LIMITED", "/api/trades/import"]) {
      expect(doc, text).toContain(text);
    }
    expect(doc).toMatch(/MT5[^\n]*browser|browser[^\n]*MT5/i);
  });

  it("limits the 'id in the body or ?id=' rule to the routes that read the id that way", () => {
    const paragraph = /\*\*Updating and deleting\.\*\*([\s\S]*?)\n\n/.exec(doc)?.[1].replace(/\s+/g, " ") ?? "";
    const named = [...paragraph.matchAll(/`(\/api\/[^`]+)`/g)].map((match) => match[1]).sort();
    const reading = walk(apiDir)
      .filter((file) => file.endsWith(`${sep}route.ts`) && readFileSync(file, "utf8").includes("readId(request)"))
      .map(routePath)
      .sort();
    expect(reading.length).toBeGreaterThan(5);
    // Every route that reads the id that way is named; the others it names are documented routes that take no id.
    expect(named.filter((path) => reading.includes(path))).toEqual(reading);
    const documented = new Set([...routesInDoc().keys()].map((key) => key.split(" ")[1]));
    expect(named.filter((path) => !reading.includes(path) && !documented.has(path))).toEqual([]);
    // The routes with :id in their path take the id there, and the paragraph says so.
    expect(paragraph).toMatch(/`:id` in its path takes the id from the path/);
  });

  it("says JSON is required for POST and PATCH bodies, which is what readJson enforces", () => {
    const paragraph = /\*\*Bodies are JSON\.\*\*([\s\S]*?)\n\n/.exec(doc)?.[1].replace(/\s+/g, " ") ?? "";
    expect(paragraph).toMatch(/`POST` or `PATCH` body must be sent as `Content-Type: application\/json`/);
    expect(paragraph).toContain("415");
    expect(readFileSync(join(root, "src/lib/api/response.ts"), "utf8")).toContain('"UNSUPPORTED_MEDIA_TYPE", "Send the request body as application/json", 415');
    expect(paragraph).not.toMatch(/any request/i);
  });

  it("names `language` for the onboarding routes, which do not read `locale`", () => {
    const paragraph = /\*\*Language\.\*\*([\s\S]*?)\n\n/.exec(doc)?.[1].replace(/\s+/g, " ") ?? "";
    for (const route of ["plan", "sprint"]) {
      const source = readFileSync(join(apiDir, "onboarding", route, "route.ts"), "utf8");
      expect(source).toContain("language");
      expect(source).not.toMatch(/get\("locale"\)|input\.locale|locale:/);
    }
    expect(paragraph).toContain("`locale`");
    expect(paragraph).toMatch(/onboarding[^.]*`language`/);
  });

  it("quotes only error codes that exist in the code", () => {
    const section = doc.split(/^## /m).find((part) => part.startsWith("Errors")) ?? "";
    const codes = [...section.matchAll(/`([A-Z][A-Z_]{3,})`/g)].map((match) => match[1]);
    expect(codes.length).toBeGreaterThan(6);
    const source = sourceText();
    expect(codes.filter((code) => !source.includes(`"${code}"`))).toEqual([]);
  }, 30_000);

  it("describes the health route's own answer, which has no envelope", () => {
    const health = readFileSync(join(apiDir, "health", "route.ts"), "utf8");
    expect(health).toContain("Response.json({ status");
    expect(doc).toMatch(/\/api\/health[^\n]*status/);
  });
});

describe("the Import section of docs/API.md imports what it says it imports", () => {
  const section = doc.split(/^## /m).find((part) => part.startsWith("Import\n")) ?? "";
  const flat = section.replace(/\s+/g, " ");
  const example = JSON.parse(/```json\n([\s\S]*?)\n```/.exec(section)?.[1] ?? "{}");

  /** What the server does with a request body: its schema, the column mapping, then the trade schema, row by row. */
  function tradesFrom(body: unknown) {
    const input = csvImportSchema.parse(body);
    return parseCsv(input.csv).map((row) => tradeCreateSchema.parse(mapCsvRow(row, input.mapping)));
  }

  const mt5Sample = () => {
    const bytes = readFileSync(join(root, "docs/samples/mt5-report-sample.html"));
    const file = readImportFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    if (file.kind !== "mt5") throw new Error(`the sample is read as ${file.kind}`);
    return file;
  };

  it("finds the example it checks", () => {
    expect(section.length).toBeGreaterThan(500);
    expect(example.csv).toContain("BTCUSDT");
  });

  it("saves the example's row as the closed trade its CSV describes, with stop, target, fees and close time", () => {
    const [trade] = tradesFrom(example);
    expect(trade).toMatchObject({ symbol: "BTCUSDT", status: "closed", stopLoss: 95, takeProfit: 120, fees: 1 });
    expect(trade.closedAt).toBeInstanceOf(Date);
  });

  it("lists the fields the server reads without a mapping, and says status is not one of them", () => {
    const defaults = Object.keys(csvImportSchema.parse({ csv: "symbol" }).mapping);
    const sentence = /Without `mapping`([^.]*)\./.exec(flat)?.[1] ?? "";
    const listed = [...sentence.matchAll(/`(\w+)`/g)].map((match) => match[1]);
    expect(listed.sort()).toEqual([...defaults].sort());
    expect(defaults).not.toContain("status");
    expect(flat).toMatch(/`status`[^.]*not one of them/);
    expect(flat).toMatch(/stored as `open`/);
  });

  it("tells a script to send the mapping the Import screen sends for an MT5 report", () => {
    const file = mt5Sample();
    expect(flat).toContain("MT5_IMPORT_MAPPING");
    expect(Object.keys(MT5_IMPORT_MAPPING)).toEqual(expect.arrayContaining(["status", "realizedPnl", "externalId"]));

    // With the mapping the first sample position is a closed trade with its id and result; without it, an open one with neither.
    const body = { csv: file.csv, timeZone: "Europe/Helsinki" };
    expect(tradesFrom({ ...body, mapping: MT5_IMPORT_MAPPING })[0]).toMatchObject({
      status: "closed",
      externalId: "mt5:51234567:7700101",
      realizedPnl: 156.5
    });
    expect(tradesFrom(body)[0]).toMatchObject({ status: "open" });
    expect(tradesFrom(body)[0].externalId).toBeUndefined();
  });

  it("says the screen reads the HTML report, and that an XLSX report is saved as CSV first", () => {
    const screen = readFileSync(join(root, "src/features/import/csv-import-screen.tsx"), "utf8");
    expect(screen).toContain('accept=".csv,.htm,.html');
    expect(screen).not.toMatch(/accept="[^"]*xls/i);
    expect(flat).toMatch(/XLSX[^.]*saved as CSV/);
  });
});
