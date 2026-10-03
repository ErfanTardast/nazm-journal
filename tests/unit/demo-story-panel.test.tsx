import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn() }));
import { apiFetch } from "@/lib/api/client";
import { DemoStoryPanel } from "@/features/demo/demo-story-panel";
import { buildDemoStory } from "@/lib/demo/story";

describe("DemoStoryPanel", () => {
  it("renders the fetched two-week story summary and grade arc", async () => {
    vi.mocked(apiFetch).mockResolvedValue(buildDemoStory() as never);
    render(<DemoStoryPanel locale="en" />);
    expect(await screen.findByText("Two-week story")).toBeInTheDocument();
    expect(screen.getByText(/C → A/)).toBeInTheDocument(); // discipline improves
    expect(screen.getByText(/Trades: 35/)).toBeInTheDocument();
    expect(screen.getByText(/AI declined an entry-call/)).toBeInTheDocument();
  });

  it("renders nothing (degrades gracefully) when the fetch fails", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("offline"));
    const { container } = render(<DemoStoryPanel locale="en" />);
    // microtask flush so the .catch runs
    await Promise.resolve();
    expect(container.firstChild).toBeNull();
  });
});
