import { describe, expect, it } from "vitest";
import { generateTotpCode, generateTotpSecret, verifyTotpCode } from "@/lib/security/totp";
import { hashToken, signCookieValue, verifySignedCookieValue } from "@/lib/security/tokens";

describe("auth helpers", () => {
  it("hashes tokens deterministically", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).not.toBe("abc");
  });

  it("signs and verifies cookie values", () => {
    const signed = signCookieValue("session-token");
    expect(verifySignedCookieValue(signed)).toBe("session-token");
    expect(verifySignedCookieValue(`${signed}tampered`)).toBeNull();
  });

  it("generates valid totp codes", () => {
    const secret = generateTotpSecret();
    const code = generateTotpCode(secret);
    expect(verifyTotpCode(secret, code)).toBe(true);
  });
});

