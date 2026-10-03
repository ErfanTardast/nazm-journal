/**
 * A stand-in for the database that applies the filters it is given, so a test can see which rows a service really
 * reads, writes and deletes (a mock that answers whatever it is asked would hide a missing `userId` or `isSample`).
 *
 * It knows only the tables the sample workspace and the trade service touch, only the filters they use (equality,
 * `in`, `not`), and the foreign-key actions of the schema that matter here: deleting a trade deletes its journal entry
 * and clears the plans that were converted from it, deleting a strategy clears the trades and plans that used it.
 * Transactions run one after another (like the row lock the sample claim takes) and roll back every change when the
 * callback throws. Each call yields once, so two overlapping requests really interleave.
 */
export type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const TABLES = ["user", "strategy", "trade", "tradeJournalEntry", "tradePlan", "review", "asset", "portfolio", "tradeImport", "tradeImportRow"] as const;
export type TableName = (typeof TABLES)[number];
type Tables = Record<TableName, Row[]>;

/** Tables whose rows carry the `isSample` mark, false unless a write says otherwise. */
const SAMPLE_TABLES: TableName[] = ["strategy", "trade", "tradePlan", "review"];
const WRITES = new Set(["create", "createMany", "update", "updateMany", "deleteMany", "upsert"]);

function matches(row: Row, where: Where = {}): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (condition === undefined) return true;
    const value = row[key] ?? null;
    if (condition !== null && typeof condition === "object" && !(condition instanceof Date) && !Array.isArray(condition)) {
      const filter = condition as Record<string, unknown>;
      if ("in" in filter) return (filter.in as unknown[]).includes(value);
      if ("not" in filter) return value !== filter.not;
      if (["gte", "lte", "gt", "lt"].some((operator) => operator in filter)) {
        // A range on a date or a number; a row with no value there is outside every range.
        if (value === null) return false;
        const at = (item: unknown) => (item instanceof Date ? item.getTime() : (item as number));
        const here = at(value);
        return (
          (!("gte" in filter) || here >= at(filter.gte)) &&
          (!("lte" in filter) || here <= at(filter.lte)) &&
          (!("gt" in filter) || here > at(filter.gt)) &&
          (!("lt" in filter) || here < at(filter.lt))
        );
      }
      throw new Error(`The fake database does not know the filter on "${key}": ${JSON.stringify(filter)}`);
    }
    return value === condition;
  });
}

const defined = (data: Row) => Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));

export function fakeDb(seed: Partial<Tables> = {}) {
  let tables = Object.fromEntries(TABLES.map((name) => [name, structuredClone(seed[name] ?? [])])) as Tables;
  let counter = 0;
  const log: string[] = [];
  const nextId = (table: string) => `${table}-${++counter}`;

  function cascadeDelete(table: TableName, removed: Row[]) {
    const ids = removed.map((row) => row.id);
    if (table === "trade") {
      tables.tradeJournalEntry = tables.tradeJournalEntry.filter((entry) => !ids.includes(entry.tradeId));
      for (const plan of tables.tradePlan) if (ids.includes(plan.convertedTradeId)) plan.convertedTradeId = null;
    }
    if (table === "strategy") {
      for (const trade of tables.trade) if (ids.includes(trade.strategyId)) trade.strategyId = null;
      for (const plan of tables.tradePlan) if (ids.includes(plan.strategyId)) plan.strategyId = null;
    }
  }

  function include(table: TableName, row: Row, spec: Record<string, unknown> | undefined) {
    if (!spec) return row;
    const extra: Row = {};
    if (table === "trade") {
      if (spec.journalEntry) extra.journalEntry = tables.tradeJournalEntry.find((entry) => entry.tradeId === row.id) ?? null;
      if (spec.strategy) extra.strategy = tables.strategy.find((strategy) => strategy.id === row.strategyId) ?? null;
      if (spec.asset) extra.asset = tables.asset.find((asset) => asset.id === row.assetId) ?? null;
      if (spec.portfolio) extra.portfolio = tables.portfolio.find((portfolio) => portfolio.id === row.portfolioId) ?? null;
    }
    return { ...row, ...extra };
  }

  const pick = (row: Row, select?: Record<string, boolean>) => (select ? Object.fromEntries(Object.keys(select).map((key) => [key, row[key]])) : row);

  function delegate(table: TableName) {
    const rows = () => tables[table];
    const make = (data: Row): Row => {
      const row: Row = { ...defined(data) };
      row.id ??= nextId(table);
      if (SAMPLE_TABLES.includes(table)) row.isSample ??= false;
      return row;
    };
    const op = <Args extends unknown[], Result>(name: string, run: (...args: Args) => Result) =>
      async (...args: Args): Promise<Awaited<Result>> => {
        await Promise.resolve();
        log.push(`${table}.${name}`);
        return run(...args) as Awaited<Result>;
      };
    return {
      findMany: op("findMany", ({ where, select }: { where?: Where; select?: Record<string, boolean> } = {}) => rows().filter((row) => matches(row, where)).map((row) => pick(row, select))),
      findFirst: op("findFirst", ({ where, select, include: spec }: { where?: Where; select?: Record<string, boolean>; include?: Record<string, unknown> } = {}) => {
        const found = rows().find((row) => matches(row, where));
        return found ? pick(include(table, found, spec), select) : null;
      }),
      findUnique: op("findUnique", ({ where, select }: { where: Where; select?: Record<string, boolean> }) => {
        const found = rows().find((row) => matches(row, where));
        return found ? pick(found, select) : null;
      }),
      count: op("count", ({ where }: { where?: Where } = {}) => rows().filter((row) => matches(row, where)).length),
      create: op("create", ({ data, include: spec }: { data: Row; include?: Record<string, unknown> }) => {
        const { journalEntry, ...own } = data as Row & { journalEntry?: { create: Row } };
        const row = make(own);
        rows().push(row);
        if (table === "trade" && journalEntry?.create) tables.tradeJournalEntry.push({ ...defined(journalEntry.create), id: nextId("tradeJournalEntry"), tradeId: row.id });
        return include(table, row, spec);
      }),
      createMany: op("createMany", ({ data }: { data: Row[] }) => {
        for (const item of data) {
          const row = make(item);
          if (rows().some((existing) => existing.id === row.id)) throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
          rows().push(row);
        }
        return { count: data.length };
      }),
      update: op("update", ({ where, data }: { where: Where; data: Row }) => {
        const found = rows().find((row) => matches(row, where));
        if (!found) throw Object.assign(new Error("Record to update not found"), { code: "P2025" });
        Object.assign(found, defined(data));
        return found;
      }),
      updateMany: op("updateMany", ({ where, data }: { where?: Where; data: Row }) => {
        const found = rows().filter((row) => matches(row, where));
        for (const row of found) Object.assign(row, defined(data));
        return { count: found.length };
      }),
      deleteMany: op("deleteMany", ({ where }: { where?: Where } = {}) => {
        const removed = rows().filter((row) => matches(row, where));
        tables[table] = rows().filter((row) => !removed.includes(row));
        cascadeDelete(table, removed);
        return { count: removed.length };
      }),
      upsert: op("upsert", ({ where, create }: { where: Where; create: Row }) => {
        const [compound] = Object.values(where);
        const found = rows().find((row) => matches(row, compound as Where));
        if (found) return found;
        const row = make(create);
        rows().push(row);
        return row;
      })
    };
  }

  const client = Object.fromEntries(TABLES.map((name) => [name, delegate(name)])) as unknown as Record<TableName, ReturnType<typeof delegate>> & {
    $transaction: <T>(callback: (tx: unknown) => Promise<T>, options?: unknown) => Promise<T>;
  };
  let lock: Promise<unknown> = Promise.resolve();
  client.$transaction = (callback) => {
    const run = lock.then(async () => {
      const snapshot = structuredClone(tables);
      log.push("$transaction");
      try {
        return await callback(client);
      } catch (error) {
        tables = snapshot;
        throw error;
      }
    });
    lock = run.catch(() => undefined);
    return run;
  };

  return {
    client,
    /** What is stored now, one table at a time. */
    rows: (table: TableName) => tables[table],
    /** The writes made so far, as "table.operation". Reads are left out. */
    writes: () => log.filter((entry) => WRITES.has(entry.split(".")[1])),
    log
  };
}

export type FakeDb = ReturnType<typeof fakeDb>;
