import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";

const nav = vi.hoisted(() => ({ path: "/en/plans" }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path, useRouter: () => router }));
vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, apiFetch: vi.fn() };
});
import { apiFetch } from "@/lib/api/client";
import { SampleBanner } from "@/features/sample/sample-banner";
import { CsvImportScreen } from "@/features/import/csv-import-screen";
import { askSampleRecheck, SAMPLE_RECHECK_EVENT, SAMPLE_REMOVED_EVENT } from "@/features/sample/sample-workspace-client";

const loaded = { active: true, loadedAt: "2026-10-02T09:30:00.000Z", canLoad: true };
const empty = { active: false, loadedAt: null, canLoad: true };
/** Once the person has a trade of their own, sample data is gone and cannot be loaded again. */
const gaveWayToTrade = { active: false, loadedAt: null, canLoad: false };

const sampleGets = () => (apiFetch as Mock).mock.calls.filter(([path, init]) => path === "/api/sample-workspace" && (init?.method ?? "GET") === "GET").length;

afterEach(() => {
  cleanup();
  (apiFetch as Mock).mockReset();
});

/**
 * Converting a plan writes the person's first real trade, which removes the sample data, but the convert answer does
 * not say so. The plans screen asks the label to look again, and the label looks only while it shows sample data.
 */
describe("the sample label, asked to check again", () => {
  let state: unknown = loaded;
  beforeEach(() => {
    state = loaded;
    (apiFetch as Mock).mockImplementation(async (path: string) => {
      if (path !== "/api/sample-workspace") throw new Error(`Unexpected request ${path}`);
      return state;
    });
  });

  it("looks now, and says the first real trade removed the sample data", async () => {
    render(<SampleBanner locale="en" />);
    await screen.findByRole("button", { name: /remove sample data/i });
    expect(sampleGets()).toBe(1);

    state = gaveWayToTrade;
    await act(async () => askSampleRecheck());

    await waitFor(() => expect(sampleGets()).toBe(2));
    expect(await screen.findByText("Sample data was removed because you saved your first real trade.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remove sample data/i })).not.toBeInTheDocument();
  });

  it("costs an account without sample data no request", async () => {
    state = empty;
    const { container } = render(<SampleBanner locale="en" />);
    await waitFor(() => expect(sampleGets()).toBe(1));
    await act(async () => {});

    await act(async () => askSampleRecheck());
    await act(async () => {});
    expect(sampleGets()).toBe(1);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("the import screen", () => {
  const heard = vi.fn();
  beforeEach(() => window.addEventListener(SAMPLE_REMOVED_EVENT, heard));
  afterEach(() => {
    window.removeEventListener(SAMPLE_REMOVED_EVENT, heard);
    heard.mockReset();
  });

  async function importRows(sampleRemoved: boolean) {
    (apiFetch as Mock).mockImplementation(async (url: string) => {
      if (url === "/api/users/me/settings") return { settings: { timezone: "UTC", brokerTimeZone: "mt5:new-york-close" } };
      if (url === "/api/trades/import") return { imported: 1, duplicates: 0, validRows: 1, invalidRows: 0, sampleRemoved };
      throw new Error(`Unexpected request ${url}`);
    });
    render(<CsvImportScreen locale="en" messages={getMessages("en")} />);
    const textarea = screen.getByRole("textbox", { name: /content/i });
    fireEvent.change(textarea, { target: { value: "symbol,market,side,entryPrice,quantity,openedAt\nBTCUSDT,crypto,long,60000,0.1,2026-09-01T10:00:00" } });
    fireEvent.click(screen.getByRole("button", { name: /import valid rows/i }));
    await screen.findByText(/1 trade imported into the journal/);
  }

  it("tells the label when the first imported trade removed the sample data", async () => {
    await importRows(true);
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("says nothing when no sample data was removed", async () => {
    await importRows(false);
    expect(heard).not.toHaveBeenCalled();
  });
});

describe("askSampleRecheck", () => {
  it("is one window event, so a page without the label in it is not affected", () => {
    const heard = vi.fn();
    window.addEventListener(SAMPLE_RECHECK_EVENT, heard);
    askSampleRecheck();
    window.removeEventListener(SAMPLE_RECHECK_EVENT, heard);
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
