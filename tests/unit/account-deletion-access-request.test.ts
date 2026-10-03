// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import { deleteUserAccount } from "@/lib/services/account-deletion";

/** A database whose every count is 0 and whose transaction runs the callback against `tx`. */
function fakeDb(tx: object) {
  const counter = { count: async () => 0 };
  return new Proxy(
    { $transaction: async (run: (client: object) => Promise<unknown>) => run(tx) },
    { get: (target, key) => (key in target ? (target as Record<string | symbol, unknown>)[key] : counter) }
  );
}

function fakeTx(email: string) {
  const order: string[] = [];
  const tx = {
    auditLog: {
      deleteMany: vi.fn(async () => {
        order.push("auditLog.deleteMany");
        return { count: 0 };
      }),
      create: vi.fn(async () => {
        order.push("auditLog.create");
        return {};
      })
    },
    user: {
      delete: vi.fn(async () => {
        order.push("user.delete");
        return { email };
      })
    },
    accessRequest: {
      deleteMany: vi.fn(async () => {
        order.push("accessRequest.deleteMany");
        return { count: 1 };
      })
    }
  };
  return { tx, order };
}

describe("deleting an account", () => {
  it("also deletes the access request made with the same e-mail", async () => {
    const { tx } = fakeTx("sara@example.com");

    await deleteUserAccount("u1", fakeDb(tx) as never);

    expect(tx.user.delete).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "u1" } }));
    expect(tx.accessRequest.deleteMany).toHaveBeenCalledTimes(1);
    expect(tx.accessRequest.deleteMany).toHaveBeenCalledWith({ where: { email: "sara@example.com" } });
  });

  it("matches the lower-cased form a request is stored under", async () => {
    const { tx } = fakeTx("Sara@Example.COM");

    await deleteUserAccount("u1", fakeDb(tx) as never);

    expect(tx.accessRequest.deleteMany).toHaveBeenCalledWith({ where: { email: "sara@example.com" } });
  });

  it("does it in the same transaction as the account, so one cannot be left without the other", async () => {
    const { tx, order } = fakeTx("sara@example.com");

    await deleteUserAccount("u1", fakeDb(tx) as never);

    expect(order).toEqual(["auditLog.deleteMany", "user.delete", "accessRequest.deleteMany", "auditLog.create"]);
  });

  it("leaves the transaction failing as a whole when the request cannot be deleted", async () => {
    const { tx } = fakeTx("sara@example.com");
    tx.accessRequest.deleteMany.mockRejectedValueOnce(new Error("db down"));

    await expect(deleteUserAccount("u1", fakeDb(tx) as never)).rejects.toThrow("db down");
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});
