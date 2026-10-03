import { AppError, notFound } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";
import { auditLog } from "@/lib/security/audit";
import type { AccessRequestInput, AccessRequestStatus } from "@/lib/validation/access";

/** Most requests the public form takes in 24 hours, from everyone together; the per-address limit sits on top of it. */
export const ACCESS_REQUESTS_PER_DAY = 300;

/**
 * The global ceiling next to the per-address limit: when more than ACCESS_REQUESTS_PER_DAY requests were created in the
 * last 24 hours, answer 429 with the app's normal rate-limit error (same code, message and status as enforceRateLimit),
 * so a flood from many addresses cannot fill the table or bury the real requests.
 */
async function assertDailyCapacity(now: Date) {
  const recent = await prisma.accessRequest.count({ where: { createdAt: { gte: new Date(now.getTime() - DAY_MS) } } });
  if (recent > ACCESS_REQUESTS_PER_DAY) throw new AppError("RATE_LIMITED", "Too many requests. Please try again later.", 429);
}

/**
 * Keep a request for an invite, one row per (lower-cased) e-mail. The first submission wins: a repeat request for the
 * same e-mail changes nothing (`update: {}`), because the public form cannot prove who owns the address and anyone
 * who knows it could otherwise blank or replace the real person's name and note, or the status an admin set.
 * Whether the e-mail asked before cannot be told from the outcome, so the route answers both the same way.
 *
 * With `update: {}` Prisma runs the upsert as a SELECT and then an INSERT (not one `INSERT ... ON CONFLICT`), so two first
 * requests for one e-mail at the same moment can both see no row; the second INSERT then fails on the unique index
 * (P2002). That request was stored by the other one, so it is read back and returned instead of answering 500, which
 * would also show that the address had not asked before.
 *
 * It also runs the retention purge (see purgeAnsweredAccessRequests), so the 30-day rule the privacy page states does not
 * depend on an admin opening the list: it holds whenever either side is used.
 */
export async function recordAccessRequest(input: Omit<AccessRequestInput, "website">, now: Date = new Date()) {
  await assertDailyCapacity(now);
  await purgeAnsweredAccessRequests(now).catch(logPurgeFailure);
  try {
    return await prisma.accessRequest.upsert({
      where: { email: input.email },
      create: {
        email: input.email,
        name: input.name,
        tradingPlatform: input.tradingPlatform ?? null,
        note: input.note ?? null,
        locale: input.locale
      },
      update: {}
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const existing = await prisma.accessRequest.findUnique({ where: { email: input.email } });
      if (existing) return existing;
    }
    throw error;
  }
}

/** The audit action of a request the honeypot caught. */
export const DROPPED_REQUEST_ACTION = "access.request_dropped";

/**
 * Leave the bare trace of a request the honeypot caught (no request object, no field value; see the route). The trace is
 * capped like the requests themselves: at ACCESS_REQUESTS_PER_DAY entries in the last 24 hours no further one is written,
 * so a script on many addresses cannot fill the audit log or push real entries (such as an admin bootstrap) out of the
 * short list the admin overview shows. The caller answers the same either way. Returns whether an entry was written.
 */
export async function traceDroppedAccessRequest(now: Date = new Date()) {
  const recent = await prisma.auditLog.count({
    where: { action: DROPPED_REQUEST_ACTION, createdAt: { gte: new Date(now.getTime() - DAY_MS) } }
  });
  if (recent >= ACCESS_REQUESTS_PER_DAY) return false;
  await auditLog({ action: DROPPED_REQUEST_ACTION, entity: "AccessRequest" });
  return true;
}

/** Most requests one admin list returns (newest first); a private trial never gets near it. */
const ADMIN_LIST_LIMIT = 500;

type AccessRequestRow = {
  id: string;
  name: string;
  email: string;
  tradingPlatform: string | null;
  note: string | null;
  locale: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

/** What the admin screen gets for one request: exactly these fields, nothing the row might gain later. */
function toAdminAccessRequest(row: AccessRequestRow) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    tradingPlatform: row.tradingPlatform,
    note: row.note,
    locale: row.locale,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

/** Prisma's "record not found" on update and delete, recognised by its code so a missing row answers 404. */
function isMissingRecord(error: unknown) {
  return hasPrismaCode(error, "P2025");
}

/** Prisma's "unique constraint failed" (P2002), here a second insert for an e-mail that has a row by now. */
function isUniqueViolation(error: unknown) {
  return hasPrismaCode(error, "P2002");
}

function hasPrismaCode(error: unknown, code: string) {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === code;
}

/** How long an answered request (invited or declined) is kept, counted from the answer. The privacy page says the same. */
export const ANSWERED_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Delete the requests that were answered (invited or declined) more than ANSWERED_RETENTION_DAYS ago. The answer is the
 * last change of the row (`updatedAt`), because only an admin's decision changes it. A request still waiting
 * ("new") is never touched. `now` is injectable so the rule can be tested without waiting. Returns how many went.
 */
export async function purgeAnsweredAccessRequests(now: Date = new Date()) {
  const cutoff = new Date(now.getTime() - ANSWERED_RETENTION_DAYS * DAY_MS);
  const { count } = await prisma.accessRequest.deleteMany({
    where: { status: { in: ["invited", "declined"] }, updatedAt: { lt: cutoff } }
  });
  return count;
}

/** A failed purge must not stop the request or the list it runs beside; it is logged for the owner. */
function logPurgeFailure(error: unknown) {
  console.error("access request purge failed", error);
}

/**
 * The newest ADMIN_LIST_LIMIT requests (optionally one status) and how many match in all, so the screen can say when
 * the list is cut. Runs the retention purge first.
 */
export async function listAccessRequests(status?: AccessRequestStatus, now: Date = new Date()) {
  // The retention rule runs whenever an admin opens the list. A failed purge must not hide the list; it is logged.
  await purgeAnsweredAccessRequests(now).catch(logPurgeFailure);
  const where = status ? { status } : undefined;
  const [rows, total] = await Promise.all([
    prisma.accessRequest.findMany({ where, orderBy: { createdAt: "desc" }, take: ADMIN_LIST_LIMIT }),
    prisma.accessRequest.count({ where })
  ]);
  return { items: rows.map(toAdminAccessRequest), total };
}

/** The admin's decision on one request. Moving it back to "new" is allowed. Only the status changes. */
export async function setAccessRequestStatus(id: string, status: AccessRequestStatus) {
  try {
    return toAdminAccessRequest(await prisma.accessRequest.update({ where: { id }, data: { status } }));
  } catch (error) {
    if (isMissingRecord(error)) throw notFound("Access request not found");
    throw error;
  }
}

/** Remove one request for good (what the privacy policy promises when the person asks). */
export async function deleteAccessRequest(id: string) {
  try {
    await prisma.accessRequest.delete({ where: { id } });
  } catch (error) {
    if (isMissingRecord(error)) throw notFound("Access request not found");
    throw error;
  }
}
