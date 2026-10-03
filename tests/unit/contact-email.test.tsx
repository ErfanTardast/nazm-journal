import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ContactEmail } from "@/features/access/contact-email-link";
import { contactEmail } from "@/features/access/contact-email";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("contactEmail", () => {
  it("reads NEXT_PUBLIC_CONTACT_EMAIL, trimmed", () => {
    expect(contactEmail({ NEXT_PUBLIC_CONTACT_EMAIL: "  hello@nazm.example " })).toBe("hello@nazm.example");
  });

  it("reads the process environment when none is given", () => {
    vi.stubEnv("NEXT_PUBLIC_CONTACT_EMAIL", "support@example.com");
    expect(contactEmail()).toBe("support@example.com");
  });

  it.each([undefined, "", "   "])("is null when the variable is %j", (value) => {
    expect(contactEmail({ NEXT_PUBLIC_CONTACT_EMAIL: value })).toBeNull();
    expect(contactEmail({})).toBeNull();
  });

  it.each([
    "not-an-email",
    "a@b",
    "two@example.com three@example.com",
    "name@example.com?cc=other@example.com",
    "mailto:name@example.com",
    "<name@example.com>",
    "javascript:alert(1)",
    `${"a".repeat(250)}@example.com`
  ])("is null for a value that is not one plain address: %s", (value) => {
    expect(contactEmail({ NEXT_PUBLIC_CONTACT_EMAIL: value })).toBeNull();
  });
});

describe("ContactEmail", () => {
  it("shows the address as selectable, left-to-right text that is a mailto link", () => {
    render(<ContactEmail email="hello@nazm.example" />);

    const link = screen.getByRole("link", { name: "hello@nazm.example" });
    expect(link).toHaveAttribute("href", "mailto:hello@nazm.example");
    expect(link).toHaveAttribute("dir", "ltr");
    expect(link.className).toContain("select-all");
  });
});
