import { describe, expect, it } from "vitest";
import { splitListInput } from "@/lib/text/split-list";

// A Persian keyboard types "،" (U+060C) for a comma; tags and mistakes typed that way were saved as one item.
describe("splitListInput", () => {
  it("splits on the Persian comma as well as the ASCII comma", () => {
    expect(splitListInput("شکست، مرور")).toEqual(["شکست", "مرور"]);
    expect(splitListInput("ورود دیر،حجم زیاد, FOMO")).toEqual(["ورود دیر", "حجم زیاد", "FOMO"]);
  });

  it("trims items and drops empty ones", () => {
    expect(splitListInput(" a ,, b ، ")).toEqual(["a", "b"]);
    expect(splitListInput("")).toEqual([]);
    expect(splitListInput(null)).toEqual([]);
  });
});
