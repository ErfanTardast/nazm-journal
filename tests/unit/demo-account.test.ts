import { describe, expect, it } from "vitest";
import { DEMO_EMAIL, FORMER_DEMO_EMAIL, renameFormerDemoAccount } from "@/lib/services/demo-account";
import { fakeDb } from "./support/fake-db";

// The demo login moved from the product's former name to demo@nazm.example. A database seeded before that holds the
// old account with its trades and journal, and both launchers run the seed on every start: without a rename in place
// the seed would add a second demo user and the login shown on the sign-in page would open an empty workspace.
const asClient = (db: ReturnType<typeof fakeDb>) => db.client as unknown as Parameters<typeof renameFormerDemoAccount>[0];

describe("the demo account after the rename", () => {
  it("uses the new login, and the former one is a different address", () => {
    expect(DEMO_EMAIL).toBe("demo@nazm.example");
    expect(FORMER_DEMO_EMAIL).toBe("demo@trademaster.ai");
  });

  it("renames the former account in place, so its trades and journal stay with the login the page shows", async () => {
    const db = fakeDb({
      user: [{ id: "u-old", email: FORMER_DEMO_EMAIL, name: "Demo Trader" }],
      trade: [{ id: "t1", userId: "u-old", symbol: "BTCUSDT" }]
    });
    expect(await renameFormerDemoAccount(asClient(db))).toBe(true);
    expect(db.rows("user")).toEqual([{ id: "u-old", email: DEMO_EMAIL, name: "Demo Trader" }]);
    // The seed's upsert now finds this user, and the trade it owns is the one the demo login sees.
    const found = (await db.client.user.findUnique({ where: { email: DEMO_EMAIL } })) as { id: string };
    expect(found.id).toBe("u-old");
    expect(db.rows("trade").every((trade) => trade.userId === found.id)).toBe(true);
  });

  it("leaves an account that already holds the new login alone, even if the former one is still there", async () => {
    const db = fakeDb({
      user: [
        { id: "u-new", email: DEMO_EMAIL },
        { id: "u-old", email: FORMER_DEMO_EMAIL }
      ]
    });
    expect(await renameFormerDemoAccount(asClient(db))).toBe(false);
    expect(db.writes()).toEqual([]);
    expect(db.rows("user").map((user) => user.email)).toEqual([DEMO_EMAIL, FORMER_DEMO_EMAIL]);
  });

  it("does nothing on a fresh database", async () => {
    // The rename matches no row, so nothing is stored: the seed's upsert creates the demo user as before.
    const db = fakeDb();
    expect(await renameFormerDemoAccount(asClient(db))).toBe(false);
    expect(db.rows("user")).toEqual([]);
  });

  it("does nothing when only the new login exists", async () => {
    const db = fakeDb({ user: [{ id: "u-new", email: DEMO_EMAIL }] });
    expect(await renameFormerDemoAccount(asClient(db))).toBe(false);
    expect(db.writes()).toEqual([]);
  });

  it("is safe to run on every start: a second run changes nothing", async () => {
    const db = fakeDb({ user: [{ id: "u-old", email: FORMER_DEMO_EMAIL }] });
    expect(await renameFormerDemoAccount(asClient(db))).toBe(true);
    expect(await renameFormerDemoAccount(asClient(db))).toBe(false);
    expect(db.rows("user")).toEqual([{ id: "u-old", email: DEMO_EMAIL }]);
  });
});
