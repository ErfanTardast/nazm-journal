import { Prisma } from "@prisma/client";
import { isUniqueViolation } from "@/lib/db/errors";
import { prisma } from "@/lib/db/prisma";
import { notFound } from "@/lib/api/errors";
import { calculateJournalMetrics, deriveTradeOutcome } from "@/lib/calculations/journal";
import { mapCsvRow, parseCsv } from "@/lib/import/csv";
import { wallTimeToUtc } from "@/lib/time/zones";
import { removeSampleWorkspaceIfLoaded } from "./sample-workspace";
import { serializeTrade, toNumber } from "./serializers";
import type { z } from "zod";
import { tradeCreateSchema, type csvImportSchema, type tradeUpdateSchema } from "@/lib/validation/trading";

type TradeCreateInput = z.infer<typeof tradeCreateSchema> & {
  tradeImportRowId?: string;
};

export async function listTrades(userId: string) {
  const trades = await prisma.trade.findMany({
    where: { userId },
    orderBy: { openedAt: "desc" },
    include: {
      journalEntry: true,
      strategy: true,
      asset: true,
      portfolio: true
    }
  });
  return trades.map(serializeTrade);
}

async function findOrCreateAsset(symbol: string, market: z.infer<typeof tradeCreateSchema>["market"]) {
  return prisma.asset.upsert({
    where: { symbol_market: { symbol, market } },
    update: {},
    create: {
      symbol,
      name: symbol,
      market
    }
  });
}

/**
 * A trade may name a strategy and a portfolio, and only the person's own: an id that is someone else's (or not there at
 * all) is answered like a trade that is not theirs, as not found. It also says whether the strategy is a sample row.
 */
async function checkOwnLinks(userId: string, links: { strategyId?: string | null; portfolioId?: string | null }) {
  const [strategy, portfolio] = await Promise.all([
    links.strategyId ? prisma.strategy.findFirst({ where: { id: links.strategyId, userId }, select: { id: true, isSample: true } }) : null,
    links.portfolioId ? prisma.portfolio.findFirst({ where: { id: links.portfolioId, userId }, select: { id: true } }) : null
  ]);
  if (links.strategyId && !strategy) throw notFound("Strategy not found");
  if (links.portfolioId && !portfolio) throw notFound("Portfolio not found");
  return { strategyIsSample: strategy?.isSample === true };
}

/**
 * Writes a person's own trade. Before it is written, the sample workspace goes (one cheap read of the account, which
 * costs an account without sample data nothing more), so sample and real trades never exist together. A trade that
 * named a sample strategy is saved without a strategy, since that strategy went with the sample. Every refusal
 * (a strategy or portfolio that is not theirs) comes first, so a trade that is not written does not remove anything.
 *
 * A batch (an import) passes one shared `removeSample`, so the account is checked once for the whole file.
 */
export async function recordTrade(
  userId: string,
  input: TradeCreateInput,
  removeSample: () => Promise<boolean> = () => removeSampleWorkspaceIfLoaded(userId)
) {
  const { strategyIsSample } = await checkOwnLinks(userId, input);
  const sampleRemoved = await removeSample();
  // A real trade never keeps a sample strategy: it is removed with the sample, here or by a first trade that overlapped
  // this one (then `sampleRemoved` is false, yet the strategy is gone all the same and its id would fail on the foreign key).
  const strategyId = strategyIsSample ? null : input.strategyId;
  return { trade: await insertTrade(userId, { ...input, strategyId }), sampleRemoved };
}

export async function createTrade(userId: string, input: TradeCreateInput) {
  return (await recordTrade(userId, input)).trade;
}

async function insertTrade(userId: string, input: TradeCreateInput) {
  const asset = await findOrCreateAsset(input.symbol, input.market);
  const derived = deriveTradeFields(input);
  const trade = await prisma.trade.create({
    data: {
      userId,
      tradeImportRowId: input.tradeImportRowId,
      ladderKey: input.ladderKey ?? undefined,
      ladderLeg: input.ladderLeg ?? undefined,
      ladderSize: input.ladderSize ?? undefined,
      externalId: input.externalId ?? undefined,
      portfolioId: input.portfolioId ?? undefined,
      strategyId: input.strategyId ?? undefined,
      assetId: asset.id,
      symbol: input.symbol,
      market: input.market,
      side: input.side,
      status: input.status,
      entryPrice: input.entryPrice,
      exitPrice: input.exitPrice ?? undefined,
      stopLoss: input.stopLoss ?? undefined,
      takeProfit: input.takeProfit ?? undefined,
      quantity: input.quantity,
      riskAmount: input.riskAmount ?? derived.riskAmount ?? undefined,
      riskPercent: input.riskPercent ?? undefined,
      rMultiple: input.rMultiple ?? derived.rMultiple ?? undefined,
      realizedPnl: input.realizedPnl ?? derived.realizedPnl ?? undefined,
      fees: input.fees,
      session: input.session ?? undefined,
      setupType: input.setupType ?? undefined,
      confidenceScore: input.confidenceScore ?? undefined,
      preTradeNotes: input.preTradeNotes ?? undefined,
      postTradeNotes: input.postTradeNotes ?? undefined,
      lessonsLearned: input.lessonsLearned ?? undefined,
      ruleFollowed: input.ruleFollowed,
      outcome: input.outcome ?? undefined,
      openedAt: input.openedAt,
      closedAt: input.closedAt ?? undefined,
      journalEntry: {
        create: {
          userId,
          emotionalState: input.journal?.emotionalState ?? undefined,
          mistakes: input.journal?.mistakes ?? [],
          tags: input.journal?.tags ?? [],
          notes: input.journal?.notes ?? undefined,
          preTradeNotes: input.journal?.preTradeNotes ?? input.preTradeNotes ?? undefined,
          postTradeNotes: input.journal?.postTradeNotes ?? input.postTradeNotes ?? undefined,
          lessonsLearned: input.journal?.lessonsLearned ?? input.lessonsLearned ?? undefined,
          ruleFollowed: input.journal?.ruleFollowed ?? input.ruleFollowed,
          review: input.journal?.review ?? undefined,
          screenshotUrl: input.journal?.screenshotUrl ?? undefined
        }
      }
    },
    include: { journalEntry: true, asset: true, strategy: true, portfolio: true }
  });
  return serializeTrade(trade);
}

export async function updateTrade(userId: string, input: z.infer<typeof tradeUpdateSchema>) {
  const existing = await prisma.trade.findFirst({ where: { id: input.id, userId }, include: { journalEntry: true } });
  if (!existing) {
    throw notFound("Trade not found");
  }
  await checkOwnLinks(userId, input);

  const asset =
    input.symbol && input.market
      ? await findOrCreateAsset(input.symbol, input.market)
      : input.symbol
        ? await findOrCreateAsset(input.symbol, existing.market)
      : undefined;
  // Stored money was derived from the prices, so a price edit makes it stale unless the edit sends it too.
  const riskStale = input.riskAmount === undefined && editsAny(existing, input, RISK_INPUTS);
  const pnlStale = input.realizedPnl === undefined && editsAny(existing, input, PNL_INPUTS);
  const rStale = input.rMultiple === undefined && editsAny(existing, input, R_INPUTS);
  const merged = { ...existing, ...input } as z.infer<typeof tradeCreateSchema>;
  const derived = deriveTradeFields({
    ...merged,
    riskAmount: riskStale ? null : merged.riskAmount,
    realizedPnl: pnlStale ? null : merged.realizedPnl
  });

  const trade = await prisma.trade.update({
    where: { id: input.id },
    data: {
      portfolioId: input.portfolioId ?? undefined,
      strategyId: input.strategyId ?? undefined,
      assetId: asset?.id,
      ladderKey: input.ladderKey,
      ladderLeg: input.ladderLeg,
      ladderSize: input.ladderSize,
      symbol: input.symbol,
      market: input.market,
      side: input.side,
      status: input.status,
      entryPrice: input.entryPrice,
      // null clears, as the derivation above assumed.
      exitPrice: input.exitPrice,
      stopLoss: input.stopLoss,
      takeProfit: input.takeProfit ?? undefined,
      quantity: input.quantity,
      riskAmount: input.riskAmount ?? derived.riskAmount ?? (riskStale ? null : undefined),
      riskPercent: input.riskPercent ?? undefined,
      rMultiple: input.rMultiple ?? derived.rMultiple ?? (rStale ? null : undefined),
      realizedPnl: input.realizedPnl ?? derived.realizedPnl ?? (pnlStale ? null : undefined),
      fees: input.fees,
      session: input.session ?? undefined,
      setupType: input.setupType ?? undefined,
      confidenceScore: input.confidenceScore ?? undefined,
      preTradeNotes: input.preTradeNotes ?? undefined,
      postTradeNotes: input.postTradeNotes ?? undefined,
      lessonsLearned: input.lessonsLearned ?? undefined,
      ruleFollowed: input.ruleFollowed,
      outcome: input.outcome ?? undefined,
      openedAt: input.openedAt,
      closedAt: input.closedAt ?? undefined,
      journalEntry: input.journal
        ? {
            upsert: {
              update: {
                emotionalState: input.journal.emotionalState ?? undefined,
                mistakes: input.journal.mistakes,
                tags: input.journal.tags,
                notes: input.journal.notes ?? undefined,
                preTradeNotes: input.journal.preTradeNotes ?? input.preTradeNotes ?? undefined,
                postTradeNotes: input.journal.postTradeNotes ?? input.postTradeNotes ?? undefined,
                lessonsLearned: input.journal.lessonsLearned ?? input.lessonsLearned ?? undefined,
                ruleFollowed: input.journal.ruleFollowed ?? input.ruleFollowed,
                review: input.journal.review ?? undefined,
                screenshotUrl: input.journal.screenshotUrl ?? undefined
              },
              create: {
                userId,
                emotionalState: input.journal.emotionalState ?? undefined,
                mistakes: input.journal.mistakes ?? [],
                tags: input.journal.tags ?? [],
                notes: input.journal.notes ?? undefined,
                preTradeNotes: input.journal.preTradeNotes ?? input.preTradeNotes ?? undefined,
                postTradeNotes: input.journal.postTradeNotes ?? input.postTradeNotes ?? undefined,
                lessonsLearned: input.journal.lessonsLearned ?? input.lessonsLearned ?? undefined,
                ruleFollowed: input.journal.ruleFollowed ?? input.ruleFollowed ?? "unknown",
                review: input.journal.review ?? undefined,
                screenshotUrl: input.journal.screenshotUrl ?? undefined
              }
            }
          }
        : undefined
    },
    include: { journalEntry: true, asset: true, strategy: true, portfolio: true }
  });
  return serializeTrade(trade);
}

export async function deleteTrade(userId: string, id: string) {
  const existing = await prisma.trade.findFirst({ where: { id, userId } });
  if (!existing) {
    throw notFound("Trade not found");
  }
  await prisma.trade.delete({ where: { id } });
  return { deleted: true };
}

export async function getTradeMetrics(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { startingBalance: true } });
  const trades = await prisma.trade.findMany({
    where: { userId },
    // Close order, so the equity curve and drawdown follow the account's history.
    orderBy: [{ closedAt: "asc" }, { openedAt: "asc" }],
    select: {
      market: true,
      side: true,
      entryPrice: true,
      exitPrice: true,
      stopLoss: true,
      quantity: true,
      fees: true,
      status: true,
      symbol: true,
      openedAt: true,
      riskAmount: true,
      realizedPnl: true,
      rMultiple: true,
      ladderKey: true,
      ladderLeg: true,
      ladderSize: true
    }
  });
  return calculateJournalMetrics(
    trades.map((trade) => ({
      market: trade.market,
      side: trade.side,
      entryPrice: Number(trade.entryPrice),
      exitPrice: trade.exitPrice === null ? null : Number(trade.exitPrice),
      stopLoss: trade.stopLoss === null ? null : Number(trade.stopLoss),
      quantity: Number(trade.quantity),
      fees: Number(trade.fees),
      status: trade.status,
      symbol: trade.symbol,
      openedAt: trade.openedAt,
      riskAmount: toNumber(trade.riskAmount),
      realizedPnl: toNumber(trade.realizedPnl),
      rMultiple: toNumber(trade.rMultiple),
      ladderKey: trade.ladderKey,
      ladderLeg: trade.ladderLeg,
      ladderSize: trade.ladderSize
    })),
    { startingBalance: toNumber(user?.startingBalance) }
  );
}

const DUPLICATE_ROW = "duplicate: this position is already in the journal";

type NamedLinks = { strategies: Map<string, boolean>; portfolios: Set<string> };

/**
 * The strategies and portfolios the rows of a file name, as far as they are the person's own, read once for the whole
 * file (and not at all when no row names one). A strategy maps to whether it is a sample row.
 */
async function readNamedLinks(userId: string, rows: { strategyId?: string | null; portfolioId?: string | null }[]): Promise<NamedLinks> {
  const strategyIds = [...new Set(rows.flatMap((row) => (row.strategyId ? [row.strategyId] : [])))];
  const portfolioIds = [...new Set(rows.flatMap((row) => (row.portfolioId ? [row.portfolioId] : [])))];
  const [strategies, portfolios] = await Promise.all([
    strategyIds.length ? prisma.strategy.findMany({ where: { userId, id: { in: strategyIds } }, select: { id: true, isSample: true } }) : [],
    portfolioIds.length ? prisma.portfolio.findMany({ where: { userId, id: { in: portfolioIds } }, select: { id: true } }) : []
  ]);
  return {
    strategies: new Map(strategies.map((strategy) => [strategy.id, strategy.isSample === true])),
    portfolios: new Set(portfolios.map((portfolio) => portfolio.id))
  };
}

/** A strategy or portfolio a row names that is not the person's: that row is invalid, the file goes on. */
function linkIssues(data: { strategyId?: string | null; portfolioId?: string | null }, links: NamedLinks) {
  const issues: { code: "custom"; path: string[]; message: string }[] = [];
  if (data.strategyId && !links.strategies.has(data.strategyId)) issues.push({ code: "custom", path: ["strategyId"], message: "Strategy not found" });
  if (data.portfolioId && !links.portfolios.has(data.portfolioId)) issues.push({ code: "custom", path: ["portfolioId"], message: "Portfolio not found" });
  return issues;
}

/** Zone-less open/close times (an MT5 report's broker time) read in the given zone; other values untouched. */
function readTimesInZone(mapped: Record<string, unknown>, timeZone: string | undefined) {
  if (!timeZone) return mapped;
  const read = (value: unknown) => (typeof value === "string" ? (wallTimeToUtc(value, timeZone)?.toISOString() ?? value) : value);
  return { ...mapped, openedAt: read(mapped.openedAt), closedAt: read(mapped.closedAt) };
}

export async function importTradesFromCsv(userId: string, input: z.infer<typeof csvImportSchema>) {
  const rows = parseCsv(input.csv);
  const tradeImport = await prisma.tradeImport.create({
    data: {
      userId,
      filename: input.filename,
      sourceType: "trademaster_csv",
      status: input.previewOnly ? "preview" : "imported",
      mapping: input.mapping,
      totalRows: rows.length
    }
  });
  const created = [];
  // The first trade the file really writes removes the sample workspace; a preview, or a file with nothing new, keeps it.
  let sampleRemoved = false;
  let sampleCheck: Promise<boolean> | undefined;
  const removeSampleOnce = () => (sampleCheck ??= removeSampleWorkspaceIfLoaded(userId).then((removed) => (sampleRemoved = removed)));
  let validRows = 0;
  let invalidRows = 0;
  let duplicates = 0;
  const preview = [];

  const parsedRows = rows.map((row) => {
    const mapped = readTimesInZone(mapCsvRow(row, input.mapping), input.timeZone);
    return { row, mapped, parsed: tradeCreateSchema.safeParse(mapped) };
  });
  // Strategies and portfolios the rows name must be the person's own; one that is not makes that row invalid. A sample
  // strategy is dropped from the row (the sample is removed with the first trade, and a real trade never keeps one).
  const links = await readNamedLinks(userId, parsedRows.flatMap(({ parsed }) => (parsed.success ? [parsed.data] : [])));
  const checked = parsedRows.map((entry) => ({
    ...entry,
    issues: entry.parsed.success ? linkIssues(entry.parsed.data, links) : [],
    data: entry.parsed.success
      ? { ...entry.parsed.data, strategyId: entry.parsed.data.strategyId && links.strategies.get(entry.parsed.data.strategyId) ? null : entry.parsed.data.strategyId }
      : null
  }));
  // Positions this user already has (an overlapping report imported before) are skipped, as are repeats
  // within the file; the unique (userId, externalId) index backs this up against concurrent imports.
  const externalIds = [...new Set(checked.flatMap(({ data, issues }) => (data && issues.length === 0 && data.externalId ? [data.externalId] : [])))];
  const known = new Set<string>(
    externalIds.length
      ? (await prisma.trade.findMany({ where: { userId, externalId: { in: externalIds } }, select: { externalId: true } })).flatMap(
          (trade) => (trade.externalId ? [trade.externalId] : [])
        )
      : []
  );

  for (const [index, { row, mapped, parsed, data, issues }] of checked.entries()) {
    if (!parsed.success || !data || issues.length > 0) {
      invalidRows += 1;
      const problems = [...(parsed.success ? [] : parsed.error.issues), ...issues];
      await prisma.tradeImportRow.create({
        data: {
          tradeImportId: tradeImport.id,
          rowNumber: index + 2,
          rawData: row as Prisma.InputJsonValue,
          mappedData: mapped as Prisma.InputJsonValue,
          isValid: false,
          errors: problems.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        }
      });
      preview.push({ rowNumber: index + 2, isValid: false, duplicate: false, errors: problems, mapped });
      continue;
    }

    validRows += 1;
    const externalId = data.externalId ?? undefined;
    const duplicate = externalId !== undefined && known.has(externalId);
    if (externalId !== undefined) known.add(externalId);
    const importRow = await prisma.tradeImportRow.create({
      data: {
        tradeImportId: tradeImport.id,
        rowNumber: index + 2,
        rawData: row as Prisma.InputJsonValue,
        mappedData: mapped as Prisma.InputJsonValue,
        isValid: true,
        errors: duplicate ? [DUPLICATE_ROW] : []
      }
    });
    const previewRow = { rowNumber: index + 2, isValid: true, duplicate, errors: [], mapped: data };
    preview.push(previewRow);
    if (duplicate) {
      duplicates += 1;
      continue;
    }

    if (!input.previewOnly) {
      try {
        created.push((await recordTrade(userId, { ...data, tradeImportRowId: importRow.id }, removeSampleOnce)).trade);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        // Another import stored this position between the check above and this write.
        duplicates += 1;
        previewRow.duplicate = true;
        await prisma.tradeImportRow.update({ where: { id: importRow.id }, data: { errors: [DUPLICATE_ROW] } });
      }
    }
  }

  await prisma.tradeImport.update({
    where: { id: tradeImport.id },
    data: {
      validRows,
      invalidRows,
      status: invalidRows > 0 && !input.previewOnly ? "failed" : input.previewOnly ? "preview" : "imported"
    }
  });

  return { importId: tradeImport.id, preview, imported: created.length, duplicates, validRows, invalidRows, trades: created, sampleRemoved };
}

// What each stored value was derived from. Realized P&L does not depend on the stop or on the symbol's
// preset (a broker P&L is kept when only the stop changes, and risk is re-derived from it).
const RISK_INPUTS = ["market", "symbol", "entryPrice", "stopLoss", "quantity"] as const;
const PNL_INPUTS = ["market", "entryPrice", "exitPrice", "quantity", "side", "status", "fees"] as const;
const R_INPUTS = [...RISK_INPUTS, ...PNL_INPUTS] as const;
const NUMERIC_INPUTS = new Set<string>(["entryPrice", "stopLoss", "exitPrice", "quantity", "fees"]);

/** Whether the edit sends a different value for any of the fields (Decimal columns compare as numbers). */
function editsAny(existing: object, input: object, fields: readonly string[]) {
  const before = existing as Record<string, unknown>;
  const after = input as Record<string, unknown>;
  return fields.some((field) => {
    const next = after[field];
    if (next === undefined) return false;
    const previous = before[field] ?? null;
    if (next === null || previous === null) return next !== previous;
    return NUMERIC_INPUTS.has(field) ? Number(next) !== Number(previous) : next !== previous;
  });
}

function deriveTradeFields(
  input: Pick<
    z.infer<typeof tradeCreateSchema>,
    "symbol" | "market" | "side" | "entryPrice" | "exitPrice" | "stopLoss" | "quantity" | "fees" | "status" | "riskAmount" | "realizedPnl"
  >
) {
  return deriveTradeOutcome({
    symbol: input.symbol,
    market: input.market,
    side: input.side,
    status: input.status,
    entryPrice: Number(input.entryPrice),
    exitPrice: input.exitPrice ? Number(input.exitPrice) : null,
    stopLoss: input.stopLoss ? Number(input.stopLoss) : null,
    quantity: Number(input.quantity),
    fees: Number(input.fees ?? 0),
    riskAmount: toNumber(input.riskAmount),
    realizedPnl: toNumber(input.realizedPnl)
  });
}
