import { describe, expect, it } from "vitest";
import { DATA_CATEGORIES, exportableCategories } from "@/lib/privacy/data-inventory";

/** The inventory says what the export holds: the person's own data, with the first-run answers, and not the sample data. */
const category = (key: string) => DATA_CATEGORIES.find((entry) => entry.key === key);

describe("the data inventory and the sample workspace", () => {
  it("says the account holds the first-run answers, and that the export includes them", () => {
    const account = category("account");
    expect(account?.exportable).toBe(true);
    expect(account?.description).toContain("first-run answers");
    expect(account?.description).toContain("trading platform");
    expect(exportableCategories().map((entry) => entry.key)).toContain("account");
  });

  it.each(["trades", "strategies", "tradePlans", "reviews"])("says that %s leave sample data out of the export", (key) => {
    const entry = category(key);
    expect(entry?.exportable).toBe(true);
    expect(entry?.description).toContain("sample data is not exported");
  });

  it("does not add a category the settings screen has no Persian words for", () => {
    // Every key here is one the Persian settings screen names itself; a new key would show in English there.
    expect(DATA_CATEGORIES.map((entry) => entry.key)).not.toContain("sampleData");
  });
});
