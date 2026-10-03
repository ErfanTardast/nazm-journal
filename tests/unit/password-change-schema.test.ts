import { describe, expect, it } from "vitest";
import { passwordChangeSchema, registerSchema } from "@/lib/validation/auth";

const strong = "NewPassword123!";

describe("passwordChangeSchema", () => {
  it("accepts a current password and a new one that meets the sign-up rules", () => {
    expect(passwordChangeSchema.parse({ currentPassword: "anything-old", newPassword: strong })).toEqual({
      currentPassword: "anything-old",
      newPassword: strong
    });
  });

  it("does not apply the new-password rules to the current password (older accounts keep working)", () => {
    expect(passwordChangeSchema.safeParse({ currentPassword: "x", newPassword: strong }).success).toBe(true);
    expect(passwordChangeSchema.safeParse({ currentPassword: "", newPassword: strong }).success).toBe(false);
    expect(passwordChangeSchema.safeParse({ currentPassword: "a".repeat(129), newPassword: strong }).success).toBe(false);
    expect(passwordChangeSchema.safeParse({ currentPassword: "a".repeat(128), newPassword: strong }).success).toBe(true);
  });

  it.each([
    ["too short", "Short1a"],
    ["no uppercase letter", "lowercase12345"],
    ["no lowercase letter", "UPPERCASE12345"],
    ["no digit", "NoDigitsHereAtAll"],
    ["longer than 128 characters", `Aa1${"x".repeat(126)}`]
  ])("rejects a new password with %s", (_label, newPassword) => {
    expect(passwordChangeSchema.safeParse({ currentPassword: "old", newPassword }).success).toBe(false);
  });

  it("uses exactly the sign-up password rules for the new password", () => {
    const samples = [strong, "Short1a", "lowercase12345", "UPPERCASE12345", "NoDigitsHereAtAll", `Aa1${"x".repeat(126)}`, `Aa1${"x".repeat(125)}`];
    for (const password of samples) {
      const register = registerSchema.safeParse({ email: "a@b.co", name: "Ab", password }).success;
      const change = passwordChangeSchema.safeParse({ currentPassword: "old", newPassword: password }).success;
      expect(change).toBe(register);
    }
  });

  it("is strict: an unknown key is refused", () => {
    expect(passwordChangeSchema.safeParse({ currentPassword: "old", newPassword: strong, extra: 1 }).success).toBe(false);
  });

  it("needs both fields", () => {
    expect(passwordChangeSchema.safeParse({ newPassword: strong }).success).toBe(false);
    expect(passwordChangeSchema.safeParse({ currentPassword: "old" }).success).toBe(false);
    expect(passwordChangeSchema.safeParse({}).success).toBe(false);
  });
});
