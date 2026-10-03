import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/auth/return-to";

describe("safeNextPath", () => {
  it("accepts a page inside the current language", () => {
    expect(safeNextPath("/fa/journal", "fa")).toBe("/fa/journal");
    expect(safeNextPath("/en/plans?tab=open", "en")).toBe("/en/plans?tab=open");
    expect(safeNextPath(["/fa/risk"], "fa")).toBe("/fa/risk");
  });

  it("drops the fragment", () => {
    expect(safeNextPath("/fa/journal#top", "fa")).toBe("/fa/journal");
  });

  it.each([
    ["nothing", undefined],
    ["an empty string", ""],
    ["another origin", "https://evil.example/fa/journal"],
    ["a protocol-relative URL", "//evil.example/fa/journal"],
    ["a backslash that browsers read as a slash", "/\\evil.example"],
    ["a backslash after the locale", "/fa/\\evil.example"],
    ["a bare path", "/journal"],
    ["the other language", "/en/journal"],
    ["a language prefix without a page", "/fa"],
    ["a dot-segment escape", "/fa/../admin"],
    ["an encoded dot-segment escape", "/fa/%2e%2e/admin"],
    ["a control character", "/fa/journal\r\nSet-Cookie: x=1"],
    ["a script URL", "javascript:alert(1)"],
    ["the sign-in page itself", "/fa/login"],
    ["the sign-up page itself", "/fa/register?next=/fa/journal"],
    ["a non-string", { next: "/fa/journal" }],
    ["an absurdly long value", `/fa/${"a".repeat(600)}`]
  ])("ignores %s", (_label, value) => {
    expect(safeNextPath(value, "fa")).toBeNull();
  });
});
