import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn() }));
const demo = vi.hoisted(() => ({ DEMO_MODE: true }));
vi.mock("@/lib/demo", () => demo);

import { AuthPanel } from "@/features/auth/auth-panel";

const en = getMessages("en");

afterEach(cleanup);

describe("AuthPanel demo credentials", () => {
  it("prefills the seeded demo login and shows the hint in demo mode", () => {
    demo.DEMO_MODE = true;
    render(<AuthPanel locale="en" messages={en} mode="login" />);
    expect(screen.getByDisplayValue("demo@nazm.example")).toBeInTheDocument();
    expect(screen.getByText(en.auth.demoHint)).toBeInTheDocument();
  });

  it("says the same demo login in both languages", () => {
    expect(en.auth.demoHint).toContain("demo@nazm.example / DemoPassword123!");
    expect(getMessages("fa").auth.demoHint).toContain("demo@nazm.example / DemoPassword123!");
  });

  it("links the Terms of Use on the register form", () => {
    render(<AuthPanel locale="fa" messages={getMessages("fa")} mode="register" />);
    const link = screen.getByRole("link", { name: getMessages("fa").auth.termsLink });
    expect(link.getAttribute("href")).toBe("/fa/terms");
  });

  it("starts empty and hides the hint when demo mode is off", () => {
    demo.DEMO_MODE = false;
    render(<AuthPanel locale="en" messages={en} mode="login" />);
    expect(screen.queryByDisplayValue("demo@nazm.example")).toBeNull();
    expect(screen.queryByDisplayValue("DemoPassword123!")).toBeNull();
    expect(screen.queryByText(en.auth.demoHint)).toBeNull();
  });
});
