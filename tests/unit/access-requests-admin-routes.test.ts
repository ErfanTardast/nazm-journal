// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { unauthorized } from "@/lib/api/errors";

vi.mock("@/lib/auth/session", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/security/audit", () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { accessRequest: { findMany: vi.fn(), count: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() } }
}));

import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { auditLog } from "@/lib/security/audit";
import { GET } from "@/app/api/admin/access-requests/route";
import { DELETE, PATCH } from "@/app/api/admin/access-requests/[id]/route";

const adminUser = { id: "a1", roles: [{ role: { name: "admin", permissions: [] } }] };
const plainUser = { id: "u1", roles: [{ role: { name: "trader", permissions: [] } }] };
const noRolesUser = { id: "u2", roles: [] };

const row = {
  id: "ar1",
  name: "Sara Trader",
  email: "sara@example.com",
  tradingPlatform: "mt5",
  note: "Journal in Excel",
  locale: "fa",
  status: "new",
  createdAt: new Date("2026-10-01T08:00:00.000Z"),
  updatedAt: new Date("2026-10-01T08:00:00.000Z")
};

const get = (query = "") => GET(new Request(`http://localhost/api/admin/access-requests${query}`));
const params = (id = "ar1") => ({ params: Promise.resolve({ id }) });
const patch = (body: unknown, init: { contentType?: string; id?: string } = {}) =>
  PATCH(
    new Request("http://localhost/api/admin/access-requests/ar1", {
      method: "PATCH",
      headers: { "content-type": init.contentType ?? "application/json" },
      body: JSON.stringify(body)
    }),
    params(init.id)
  );
const del = (id?: string) => DELETE(new Request("http://localhost/api/admin/access-requests/ar1", { method: "DELETE" }), params(id));

beforeEach(() => {
  vi.mocked(requireUser).mockResolvedValue(adminUser as never);
  vi.mocked(prisma.accessRequest.findMany).mockResolvedValue([row] as never);
  vi.mocked(prisma.accessRequest.count).mockResolvedValue(1 as never);
  vi.mocked(prisma.accessRequest.update).mockImplementation((async ({ data }: { data: object }) => ({ ...row, ...data })) as never);
  vi.mocked(prisma.accessRequest.delete).mockResolvedValue(row as never);
  vi.mocked(prisma.accessRequest.deleteMany).mockResolvedValue({ count: 0 } as never);
});
afterEach(() => vi.clearAllMocks());

const notFoundError = Object.assign(new Error("Record to update not found."), { code: "P2025" });

describe("admin access-request routes are admin-only", () => {
  const calls = [
    ["GET /api/admin/access-requests", () => get()],
    ["PATCH /api/admin/access-requests/[id]", () => patch({ status: "invited" })],
    ["DELETE /api/admin/access-requests/[id]", () => del()]
  ] as const;

  describe.each(calls)("%s", (_name, call) => {
    it("answers 401 when signed out and touches nothing", async () => {
      vi.mocked(requireUser).mockRejectedValue(unauthorized());

      const res = await call();

      expect(res.status).toBe(401);
      expect((await res.json()).error.code).toBe("UNAUTHORIZED");
      expect(prisma.accessRequest.findMany).not.toHaveBeenCalled();
      expect(prisma.accessRequest.update).not.toHaveBeenCalled();
      expect(prisma.accessRequest.delete).not.toHaveBeenCalled();
    });

    it.each([
      ["a signed-in non-admin", plainUser],
      ["a user with no roles", noRolesUser]
    ])("answers 403 for %s and touches nothing", async (_who, user) => {
      vi.mocked(requireUser).mockResolvedValue(user as never);

      const res = await call();

      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe("FORBIDDEN");
      expect(prisma.accessRequest.findMany).not.toHaveBeenCalled();
      expect(prisma.accessRequest.update).not.toHaveBeenCalled();
      expect(prisma.accessRequest.delete).not.toHaveBeenCalled();
    });

    it("answers for an admin", async () => {
      expect((await call()).status).toBe(200);
    });
  });
});

describe("GET /api/admin/access-requests", () => {
  it("lists the requests, newest first, with the fields the admin needs", async () => {
    const res = await get();

    expect(await res.json()).toEqual({
      data: {
        items: [
          {
            id: "ar1",
            name: "Sara Trader",
            email: "sara@example.com",
            tradingPlatform: "mt5",
            note: "Journal in Excel",
            locale: "fa",
            status: "new",
            createdAt: "2026-10-01T08:00:00.000Z",
            updatedAt: "2026-10-01T08:00:00.000Z"
          }
        ],
        total: 1
      }
    });
    expect(prisma.accessRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { createdAt: "desc" } }));
    expect(vi.mocked(prisma.accessRequest.findMany).mock.calls[0][0]?.where).toBeUndefined();
  });

  it("filters by ?status= and lists everything for an unknown status", async () => {
    await get("?status=invited");
    expect(vi.mocked(prisma.accessRequest.findMany).mock.calls[0][0]?.where).toEqual({ status: "invited" });

    vi.mocked(prisma.accessRequest.findMany).mockClear();
    await get("?status=bogus");
    expect(vi.mocked(prisma.accessRequest.findMany).mock.calls[0][0]?.where).toBeUndefined();
  });

  it("first deletes the requests answered more than 30 days ago (invited or declined), never one still waiting", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T12:00:00.000Z"));
    try {
      await get();
    } finally {
      vi.useRealTimers();
    }

    expect(prisma.accessRequest.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.accessRequest.deleteMany).toHaveBeenCalledWith({
      where: { status: { in: ["invited", "declined"] }, updatedAt: { lt: new Date("2026-10-02T12:00:00.000Z") } }
    });
    const purgeOrder = vi.mocked(prisma.accessRequest.deleteMany).mock.invocationCallOrder[0];
    const listOrder = vi.mocked(prisma.accessRequest.findMany).mock.invocationCallOrder[0];
    expect(purgeOrder).toBeLessThan(listOrder);
  });

  it("does not purge for a signed-out visitor or a non-admin", async () => {
    vi.mocked(requireUser).mockRejectedValue(unauthorized());
    await get();
    vi.mocked(requireUser).mockResolvedValue(plainUser as never);
    await get();

    expect(prisma.accessRequest.deleteMany).not.toHaveBeenCalled();
  });

  it("returns the total number of requests, which is larger than the list when the list is cut", async () => {
    vi.mocked(prisma.accessRequest.count).mockResolvedValue(1234 as never);

    const body = await (await get()).json();

    expect(body.data.total).toBe(1234);
    expect(body.data.items).toHaveLength(1);
  });

  it("counts with the same status filter as the list", async () => {
    await get("?status=declined");

    expect(prisma.accessRequest.count).toHaveBeenCalledWith({ where: { status: "declined" } });
  });

  it("caps the list", async () => {
    await get();

    expect(vi.mocked(prisma.accessRequest.findMany).mock.calls[0][0]?.take).toBeLessThanOrEqual(500);
  });
});

describe("PATCH /api/admin/access-requests/[id]", () => {
  it.each(["new", "invited", "declined"])("sets the status to %s", async (status) => {
    const res = await patch({ status });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ data: { id: "ar1", status } });
    expect(prisma.accessRequest.update).toHaveBeenCalledWith({ where: { id: "ar1" }, data: { status } });
  });

  it("writes the decision to the audit log under the admin's id", async () => {
    await patch({ status: "invited" });

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "a1", action: "access.review", entity: "AccessRequest", entityId: "ar1", metadata: { status: "invited" } })
    );
  });

  it("refuses an unknown status, extra fields and an empty body with 422", async () => {
    for (const body of [{ status: "approved" }, { status: "new", name: "x" }, {}]) {
      const res = await patch(body);
      expect(res.status, JSON.stringify(body)).toBe(422);
    }
    expect(prisma.accessRequest.update).not.toHaveBeenCalled();
  });

  it("answers 415 to a body that is not JSON", async () => {
    expect((await patch({ status: "invited" }, { contentType: "text/plain" })).status).toBe(415);
    expect(prisma.accessRequest.update).not.toHaveBeenCalled();
  });

  it("answers 404 for a request that does not exist", async () => {
    vi.mocked(prisma.accessRequest.update).mockRejectedValue(notFoundError);

    const res = await patch({ status: "invited" }, { id: "missing" });

    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
    expect(auditLog).not.toHaveBeenCalled();
  });

  it("never changes anything but the status", async () => {
    await patch({ status: "declined" });

    const { data } = vi.mocked(prisma.accessRequest.update).mock.calls[0][0] as { data: object };
    expect(Object.keys(data)).toEqual(["status"]);
  });
});

describe("DELETE /api/admin/access-requests/[id]", () => {
  it("removes the request and writes the audit log without its content", async () => {
    const res = await del();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { id: "ar1", deleted: true } });
    expect(prisma.accessRequest.delete).toHaveBeenCalledWith({ where: { id: "ar1" } });
    const entry = vi.mocked(auditLog).mock.calls[0][0];
    expect(entry).toMatchObject({ userId: "a1", action: "access.delete", entity: "AccessRequest", entityId: "ar1" });
    const logged = JSON.stringify(entry).toLowerCase();
    expect(logged).not.toContain("sara@example.com");
    expect(logged).not.toContain("journal in excel");
  });

  it("answers 404 for a request that does not exist", async () => {
    vi.mocked(prisma.accessRequest.delete).mockRejectedValue(notFoundError);

    const res = await del("missing");

    expect(res.status).toBe(404);
    expect(auditLog).not.toHaveBeenCalled();
  });
});
