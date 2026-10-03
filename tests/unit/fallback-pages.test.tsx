import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const nav = vi.hoisted(() => ({ path: "/fa/journal" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path }));

import Loading from "@/app/[locale]/loading";
import ErrorPage from "@/app/[locale]/error";
import LocaleNotFound from "@/app/[locale]/not-found";
import RootNotFound from "@/app/not-found";
import OfflinePage from "@/app/offline/page";
import { InstallAppPrompt } from "@/components/pwa/install-app-prompt";

const FA_ONLY = /^[^A-Za-z]*$/;

beforeEach(() => {
  nav.path = "/fa/journal";
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

// The app-level fallbacks were English-only and the 404 sent Persian users to /en (2026-09-29).
describe("loading fallback", () => {
  it.each([
    ["/fa/journal", "در حال بارگذاری محیط کار"],
    ["/en/journal", "Loading workspace"]
  ])("shows the label of the page language on %s", (path, label) => {
    nav.path = path;
    render(<Loading />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe("error fallback", () => {
  it("is Persian on /fa and does not print the raw error text", () => {
    const reset = vi.fn();
    const error = Object.assign(new Error("connect ECONNREFUSED 10.0.0.5:5432"), { digest: "abc123" });
    const { container } = render(<ErrorPage error={error} reset={reset} />);
    expect(screen.getByText("مشکلی پیش آمد")).toBeInTheDocument();
    expect(container.textContent).not.toContain("ECONNREFUSED");
    expect(container.textContent).toContain("abc123");
    fireEvent.click(screen.getByRole("button", { name: "تلاش دوباره" }));
    expect(reset).toHaveBeenCalled();
  });

  it("is English on /en", () => {
    nav.path = "/en/journal";
    render(<ErrorPage error={new Error("boom")} reset={() => undefined} />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByText("boom")).toBeNull();
  });
});

describe("404 pages", () => {
  it.each([
    ["/fa/billing", "fa", "صفحه پیدا نشد"],
    ["/en/billing", "en", "Page not found"]
  ])("link back to the workspace of the same language on %s", (path, locale, title) => {
    nav.path = path;
    for (const NotFound of [RootNotFound, LocaleNotFound]) {
      const { unmount } = render(<NotFound />);
      expect(screen.getByText(title)).toBeInTheDocument();
      expect(screen.getByRole("link").getAttribute("href")).toBe(`/${locale}/dashboard`);
      unmount();
    }
  });

  it("uses Persian when the URL names no language", () => {
    nav.path = "/nothing-here";
    render(<RootNotFound />);
    expect(screen.getByRole("link").getAttribute("href")).toBe("/fa/dashboard");
  });
});

describe("offline page", () => {
  it("says it in both languages, each with a link into its own workspace", () => {
    const { container } = render(<OfflinePage />);
    expect(container.textContent).toContain("Nazm is offline");
    expect(container.textContent).toContain("اپ نظم آفلاین است");
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(expect.arrayContaining(["/fa/dashboard", "/en/dashboard"]));
    expect(container.querySelector('[lang="fa"][dir="rtl"]')).not.toBeNull();
    expect(container.querySelector('[lang="en"][dir="ltr"]')).not.toBeNull();
  });
});

describe("install prompt", () => {
  function offerInstall() {
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt: vi.fn(async () => undefined),
      userChoice: Promise.resolve({ outcome: "dismissed" as const })
    });
    act(() => {
      window.dispatchEvent(event);
    });
    return event;
  }

  function standalone(matches: boolean) {
    window.matchMedia = vi.fn().mockReturnValue({ matches }) as unknown as typeof window.matchMedia;
  }

  it("speaks the page language", () => {
    standalone(false);
    const { container, unmount } = render(<InstallAppPrompt locale="fa" />);
    offerInstall();
    expect(screen.getByText("نصب اپ نظم")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /نصب/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "بعداً" })).toBeInTheDocument();
    expect(container.textContent).toMatch(FA_ONLY);
    unmount();

    render(<InstallAppPrompt locale="en" />);
    offerInstall();
    expect(screen.getByText("Install Nazm")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Later" })).toBeInTheDocument();
  });

  it("does not come back on the next page load after Later", () => {
    standalone(false);
    const first = render(<InstallAppPrompt locale="fa" />);
    offerInstall();
    fireEvent.click(screen.getByRole("button", { name: "بعداً" }));
    expect(screen.queryByText("نصب اپ نظم")).toBeNull();
    expect(window.localStorage.getItem("nazm-install-dismissed")).toBe("1");
    first.unmount();

    render(<InstallAppPrompt locale="fa" />);
    const event = offerInstall();
    expect(screen.queryByText("نصب اپ نظم")).toBeNull();
    // The browser's own banner is still suppressed.
    expect(event.defaultPrevented).toBe(true);
  });

  it("stays away inside the installed app", () => {
    standalone(true);
    render(<InstallAppPrompt locale="fa" />);
    offerInstall();
    expect(screen.queryByText("نصب اپ نظم")).toBeNull();
  });

  it("still works when storage is blocked", () => {
    standalone(false);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<InstallAppPrompt locale="en" />);
    offerInstall();
    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(screen.queryByText("Install Nazm")).toBeNull();
  });
});
