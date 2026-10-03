import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// A soft (client-side) navigation out of the cached offline page keeps its <html lang dir>, so a Persian visitor
// would land in the workspace with the wrong direction. The links must be full page loads.
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href} data-soft-navigation="true">
      {children}
    </a>
  )
}));

import OfflinePage from "@/app/offline/page";

afterEach(cleanup);

describe("offline page links", () => {
  it("are plain anchors, so leaving the page reloads it with the right <html lang dir>", () => {
    const { container } = render(<OfflinePage />);
    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/fa/dashboard", "/en/dashboard"]);
    expect(container.querySelector("[data-soft-navigation]")).toBeNull();
  });
});
