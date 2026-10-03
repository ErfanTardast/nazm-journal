import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/demo", () => ({ DEMO_MODE: false }));

import { AuthPanel } from "@/features/auth/auth-panel";

afterEach(cleanup);

const cases = [
  ["en", "No code?", "Request access"],
  ["fa", "کد دعوت ندارید؟", "درخواست دسترسی"]
] as const;

describe("AuthPanel: the way to ask for an invite", () => {
  it.each(cases)("%s: the sign-up form offers a link to the request-access page", (locale, question, link) => {
    render(<AuthPanel locale={locale} messages={getMessages(locale)} mode="register" inviteRequired />);

    const anchor = screen.getByRole("link", { name: link });
    expect(anchor).toHaveAttribute("href", `/${locale}/request-access`);
    expect(anchor.closest("p")?.textContent).toContain(question);
  });

  it.each(cases)("%s: the link sits right after the invite-code field, inside the form", (locale, _question, link) => {
    const { container } = render(<AuthPanel locale={locale} messages={getMessages(locale)} mode="register" inviteRequired />);

    const form = container.querySelector("form") as HTMLFormElement;
    const anchor = within(form).getByRole("link", { name: link });
    const inviteLabel = getMessages(locale).auth.inviteCodeRequired;
    const field = within(form).getByLabelText(inviteLabel);
    // The field comes first and the link follows it directly.
    expect(field.compareDocumentPosition(anchor) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(field.closest("label")?.parentElement).toBe(anchor.closest("p")?.parentElement);
  });

  it.each(cases)("%s: is shown whether or not the invite code is required", (locale, _question, link) => {
    render(<AuthPanel locale={locale} messages={getMessages(locale)} mode="register" />);

    expect(screen.getByRole("link", { name: link })).toHaveAttribute("href", `/${locale}/request-access`);
  });

  it.each(cases)("%s: is not on the sign-in form", (locale, question, link) => {
    const { container } = render(<AuthPanel locale={locale} messages={getMessages(locale)} mode="login" />);

    expect(screen.queryByRole("link", { name: link })).toBeNull();
    expect(container.textContent).not.toContain(question);
    expect(container.querySelector('a[href$="/request-access"]')).toBeNull();
  });

  it("keeps the other links of the sign-up form", () => {
    render(<AuthPanel locale="en" messages={getMessages("en")} mode="register" inviteRequired />);

    expect(screen.getByRole("link", { name: getMessages("en").auth.signIn })).toHaveAttribute("href", "/en/login");
    expect(screen.getByRole("link", { name: getMessages("en").auth.termsLink })).toHaveAttribute("href", "/en/terms");
  });
});
