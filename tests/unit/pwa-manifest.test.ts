import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

describe("pwa manifest", () => {
  it("declares an installable standalone app with icons", () => {
    const m = manifest();
    expect(m.short_name).toBe("Nazm");
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/");
    expect(m.icons?.some((i) => i.sizes === "512x512" && i.purpose === "maskable")).toBe(true);
  });
});
