import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AuthRequiredState, LoadingState } from "@/components/ui/state";

afterEach(() => {
  cleanup();
  window.history.pushState({}, "", "/");
});

// The signed-out card said "Sign in required ... demo account" in English on every Persian page (2026-09-29).
describe("AuthRequiredState", () => {
  it("speaks Persian on the Persian pages and never mentions a demo account", () => {
    const { container } = render(<AuthRequiredState locale="fa" />);
    expect(screen.getByText("ورود لازم است")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ورود" }).getAttribute("href")).toBe("/fa/login");
    expect(container.textContent).not.toMatch(/[A-Za-z]{4,}/);
    expect(container.textContent).not.toMatch(/demo|دمو|نمایشی/i);
  });

  it("speaks English on the English pages and never mentions a demo account", () => {
    const { container } = render(<AuthRequiredState locale="en" />);
    expect(screen.getByText("Sign in required")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/en/login");
    expect(container.textContent).not.toMatch(/demo/i);
  });

  it("keeps a caller's own title and description", () => {
    render(<AuthRequiredState locale="fa" title="عنوان من" description="توضیح من" />);
    expect(screen.getByText("عنوان من")).toBeInTheDocument();
    expect(screen.getByText("توضیح من")).toBeInTheDocument();
    expect(screen.queryByText("ورود لازم است")).toBeNull();
  });

  it("sends the visitor back to this page after signing in", () => {
    window.history.pushState({}, "", "/fa/journal");
    render(<AuthRequiredState locale="fa" />);
    expect(screen.getByRole("link", { name: "ورود" }).getAttribute("href")).toBe("/fa/login?next=%2Ffa%2Fjournal");
  });

  it("does not add a return path that is not a page of this language", () => {
    window.history.pushState({}, "", "/en/journal");
    render(<AuthRequiredState locale="fa" />);
    expect(screen.getByRole("link", { name: "ورود" }).getAttribute("href")).toBe("/fa/login");
  });
});

describe("LoadingState", () => {
  it("has a default label in the page language", () => {
    render(<LoadingState locale="fa" />);
    expect(screen.getByText("در حال بارگذاری")).toBeInTheDocument();
    cleanup();
    render(<LoadingState locale="en" />);
    expect(screen.getByText("Loading")).toBeInTheDocument();
  });

  it("keeps a caller's label and the old English default without a locale", () => {
    render(<LoadingState label="در حال خواندن" />);
    expect(screen.getByText("در حال خواندن")).toBeInTheDocument();
    cleanup();
    render(<LoadingState />);
    expect(screen.getByText("Loading")).toBeInTheDocument();
  });
});
