import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, apiFetch: vi.fn() };
});
import { apiFetch } from "@/lib/api/client";
import { JournalScreen } from "@/features/journal/journal-screen";
import { SAMPLE_REMOVED_EVENT } from "@/features/sample/sample-workspace-client";

const en = getMessages("en");

/**
 * The first real trade removes the sample data on the server, and `POST /api/trades` says so with `sampleRemoved`. The
 * journal reloads its list at once (the sample rows vanish), so the label above the page has to be told then, not
 * left saying "sample" until its next check.
 */
const server = { sampleRemoved: true };

function serve() {
  (apiFetch as Mock).mockImplementation(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${path}`;
    if (key === "POST /api/trades") return { trade: { id: "t1" }, sampleRemoved: server.sampleRemoved };
    if (key === "GET /api/trades") return { trades: [] };
    if (key === "GET /api/trades/metrics") {
      return { metrics: { totalTrades: 0, winRate: 0, netPnl: 0, profitFactor: 0, expectancy: 0, averageR: 0, maxDrawdownAmount: 0, equityCurve: [] } };
    }
    if (key === "GET /api/strategies") return { strategies: [] };
    if (key === "GET /api/ideas") return { ideas: [] };
    if (key === "GET /api/reviews") return { reviews: [] };
    if (key.startsWith("GET /api/news")) return { news: [] };
    if (key === "GET /api/sample-workspace") return { active: false, loadedAt: null, canLoad: true };
    throw new Error(`Unexpected request ${key}`);
  });
}

const heard = vi.fn();

afterEach(() => {
  cleanup();
  window.removeEventListener(SAMPLE_REMOVED_EVENT, heard);
  heard.mockReset();
  (apiFetch as Mock).mockReset();
  server.sampleRemoved = true;
});

async function open() {
  serve();
  window.addEventListener(SAMPLE_REMOVED_EVENT, heard);
  render(<JournalScreen locale="en" messages={en} />);
  await screen.findByRole("button", { name: "Create trade" });
}

const postedTrades = () => (apiFetch as Mock).mock.calls.filter(([path, init]) => path === "/api/trades" && init?.method === "POST").length;

describe("the journal's quick entry", () => {
  async function saveQuick() {
    await open();
    const form = screen.getByRole("button", { name: "Quick save" }).closest("form") as HTMLFormElement;
    fireEvent.change(form.elements.namedItem("symbol") as HTMLInputElement, { target: { value: "EURUSD" } });
    fireEvent.change(form.elements.namedItem("entryPrice") as HTMLInputElement, { target: { value: "1.1" } });
    await act(async () => {
      fireEvent.submit(form);
    });
    await waitFor(() => expect(postedTrades()).toBe(1));
  }

  it("tells the label when the first real trade removed the sample data", async () => {
    await saveQuick();
    await waitFor(() => expect(heard).toHaveBeenCalledTimes(1));
  });

  it("says nothing when no sample data was removed", async () => {
    server.sampleRemoved = false;
    await saveQuick();
    await act(async () => {});
    expect(heard).not.toHaveBeenCalled();
  });
});

describe("the journal's full form", () => {
  async function saveFull() {
    await open();
    const form = screen.getByRole("button", { name: "Create trade" }).closest("form") as HTMLFormElement;
    fireEvent.change(form.elements.namedItem("symbol") as HTMLInputElement, { target: { value: "EURUSD" } });
    fireEvent.change(form.elements.namedItem("entryPrice") as HTMLInputElement, { target: { value: "1.1" } });
    fireEvent.change(form.elements.namedItem("quantity") as HTMLInputElement, { target: { value: "0.5" } });
    await act(async () => {
      fireEvent.submit(form);
    });
    await waitFor(() => expect(postedTrades()).toBe(1));
  }

  it("tells the label when the first real trade removed the sample data", async () => {
    await saveFull();
    await waitFor(() => expect(heard).toHaveBeenCalledTimes(1));
  });

  it("says nothing when no sample data was removed", async () => {
    server.sampleRemoved = false;
    await saveFull();
    await act(async () => {});
    expect(heard).not.toHaveBeenCalled();
  });
});
