// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = { id: string; status: string; updatedAt: Date };
type Where = { status: { in: string[] }; updatedAt: { lt: Date } };

let rows: Row[] = [];
const calls: string[] = [];

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    accessRequest: {
      // A small in-memory stand-in that understands exactly the filter the purge uses.
      deleteMany: vi.fn(async ({ where }: { where: Where }) => {
        calls.push("deleteMany");
        const doomed = rows.filter((row) => where.status.in.includes(row.status) && row.updatedAt < where.updatedAt.lt);
        rows = rows.filter((row) => !doomed.includes(row));
        return { count: doomed.length };
      }),
      findMany: vi.fn(async () => {
        calls.push("findMany");
        return rows.map((row) => ({
          ...row,
          name: "N",
          email: `${row.id}@example.com`,
          tradingPlatform: null,
          note: null,
          locale: "en",
          createdAt: row.updatedAt
        }));
      }),
      count: vi.fn(async () => rows.length),
      upsert: vi.fn(async () => {
        calls.push("upsert");
        return { id: "stored" };
      })
    }
  }
}));

import { prisma } from "@/lib/db/prisma";
import {
  ANSWERED_RETENTION_DAYS,
  listAccessRequests,
  purgeAnsweredAccessRequests,
  recordAccessRequest
} from "@/lib/services/access-requests";

const NOW = new Date("2026-11-01T12:00:00.000Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

beforeEach(() => {
  rows = [];
  calls.length = 0;
  vi.mocked(prisma.accessRequest.deleteMany).mockClear();
  vi.mocked(prisma.accessRequest.upsert).mockClear();
});

describe("purgeAnsweredAccessRequests", () => {
  it("keeps answered requests for 30 days", () => {
    expect(ANSWERED_RETENTION_DAYS).toBe(30);
  });

  it("deletes invited and declined requests answered more than 30 days ago, and nothing else", async () => {
    rows = [
      { id: "invited-old", status: "invited", updatedAt: daysAgo(31) },
      { id: "declined-old", status: "declined", updatedAt: daysAgo(90) },
      { id: "invited-recent", status: "invited", updatedAt: daysAgo(29) },
      { id: "declined-recent", status: "declined", updatedAt: daysAgo(1) },
      { id: "waiting-old", status: "new", updatedAt: daysAgo(400) },
      { id: "waiting-new", status: "new", updatedAt: daysAgo(0) }
    ];

    const removed = await purgeAnsweredAccessRequests(NOW);

    expect(removed).toBe(2);
    expect(rows.map((row) => row.id).sort()).toEqual(["declined-recent", "invited-recent", "waiting-new", "waiting-old"]);
  });

  it("counts the 30 days from the moment the request was answered, and keeps one answered exactly 30 days ago", async () => {
    rows = [
      { id: "exactly", status: "invited", updatedAt: daysAgo(30) },
      { id: "just-over", status: "declined", updatedAt: new Date(daysAgo(30).getTime() - 1) }
    ];

    await purgeAnsweredAccessRequests(NOW);

    expect(rows.map((row) => row.id)).toEqual(["exactly"]);
  });

  it("asks the database only for answered statuses older than the cut-off", async () => {
    await purgeAnsweredAccessRequests(NOW);

    expect(prisma.accessRequest.deleteMany).toHaveBeenCalledWith({
      where: { status: { in: ["invited", "declined"] }, updatedAt: { lt: daysAgo(30) } }
    });
  });

  it("uses the real clock when none is given", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    try {
      await purgeAnsweredAccessRequests();
    } finally {
      vi.useRealTimers();
    }

    expect(vi.mocked(prisma.accessRequest.deleteMany).mock.calls[0][0]).toEqual({
      where: { status: { in: ["invited", "declined"] }, updatedAt: { lt: daysAgo(30) } }
    });
  });
});

describe("recordAccessRequest", () => {
  const input = { name: "Sara", email: "sara@example.com", locale: "en" as const };

  it("also runs the retention purge, so an answered request goes 30 days after the answer even if nobody opens the admin list", async () => {
    rows = [
      { id: "gone", status: "invited", updatedAt: daysAgo(31) },
      { id: "kept-waiting", status: "new", updatedAt: daysAgo(90) },
      { id: "kept-recent", status: "declined", updatedAt: daysAgo(2) }
    ];

    await recordAccessRequest(input, NOW);

    expect(rows.map((row) => row.id).sort()).toEqual(["kept-recent", "kept-waiting"]);
    expect(calls).toEqual(["deleteMany", "upsert"]);
  });

  it("does not purge for a request the daily ceiling refuses", async () => {
    vi.mocked(prisma.accessRequest.count).mockResolvedValueOnce(301);

    await expect(recordAccessRequest(input, NOW)).rejects.toMatchObject({ status: 429 });

    expect(prisma.accessRequest.deleteMany).not.toHaveBeenCalled();
    expect(prisma.accessRequest.upsert).not.toHaveBeenCalled();
  });

  it("still stores the request when the purge fails (and says so in the server log)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(prisma.accessRequest.deleteMany).mockRejectedValueOnce(new Error("lock timeout"));

    const saved = await recordAccessRequest(input, NOW);

    expect(saved).toEqual({ id: "stored" });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("listAccessRequests", () => {
  it("deletes the expired answered requests before it reads the list, so they are not shown", async () => {
    rows = [
      { id: "gone", status: "declined", updatedAt: daysAgo(45) },
      { id: "kept", status: "new", updatedAt: daysAgo(45) }
    ];

    const list = await listAccessRequests(undefined, NOW);

    expect(calls.slice(0, 2)).toEqual(["deleteMany", "findMany"]);
    expect(list.items.map((row) => row.id)).toEqual(["kept"]);
  });

  it("returns the number of matching requests next to the list, for the same status filter", async () => {
    rows = [
      { id: "a", status: "new", updatedAt: daysAgo(1) },
      { id: "b", status: "new", updatedAt: daysAgo(2) }
    ];

    const list = await listAccessRequests("new", NOW);

    expect(list.total).toBe(2);
    expect(prisma.accessRequest.count).toHaveBeenLastCalledWith({ where: { status: "new" } });
    expect(prisma.accessRequest.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { status: "new" } }));
  });

  it("counts every request when no status is chosen, and caps the list at 500 newest first", async () => {
    await listAccessRequests(undefined, NOW);

    expect(prisma.accessRequest.count).toHaveBeenLastCalledWith({});
    expect(prisma.accessRequest.findMany).toHaveBeenLastCalledWith({ orderBy: { createdAt: "desc" }, take: 500 });
  });

  it("still answers when the purge itself fails (and says so in the server log)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(prisma.accessRequest.deleteMany).mockRejectedValueOnce(new Error("lock timeout"));
    rows = [{ id: "kept", status: "new", updatedAt: daysAgo(1) }];

    const list = await listAccessRequests(undefined, NOW);

    expect(list.items.map((row) => row.id)).toEqual(["kept"]);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
