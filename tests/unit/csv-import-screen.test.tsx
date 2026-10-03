import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";

vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn(), isAuthError: () => false }));
import { apiFetch } from "@/lib/api/client";
import { CsvImportScreen } from "@/features/import/csv-import-screen";

afterEach(cleanup);

const MT5 = [
  "Positions,,,,,,,,,,,,",
  "Time,Position,Symbol,Type,Volume,Price,S / L,T / P,Time,Price,Commission,Swap,Profit",
  "2026.09.15 10:23:45,1001,EURUSD,buy,0.5,1.10000,1.09800,1.10600,2026.09.15 14:02:10,1.10400,-3.50,0.00,200.00",
  "2026.09.16 12:00:00,1003,,balance,,,,,,,,,1000.00",
  ",,,,,,,,,,,,"
].join("\n");

function serveApi(importResponse: object, settings: object | Error = { timezone: "UTC", brokerTimeZone: "mt5:new-york-close" }) {
  (apiFetch as Mock).mockClear();
  (apiFetch as Mock).mockImplementation(async (url: string) => {
    if (url === "/api/users/me/settings") {
      if (settings instanceof Error) throw settings;
      return { settings };
    }
    return importResponse;
  });
}

const importBody = () => {
  const call = (apiFetch as Mock).mock.calls.find((c) => c[0] === "/api/trades/import");
  return call ? JSON.parse(call[1].body) : null;
};

function upload(content: string, name: string) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File([content], name, { type: "text/html" });
  fireEvent.change(input, { target: { files: [file] } });
}

describe("CsvImportScreen file names", () => {
  it("downloads the sample as nazm-sample-trades.csv", () => {
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:sample"), revokeObjectURL: vi.fn() });
    const downloads: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });
    render(<CsvImportScreen locale="en" messages={getMessages("en")} />);
    fireEvent.click(screen.getByRole("button", { name: /download sample csv/i }));
    expect(downloads).toEqual(["nazm-sample-trades.csv"]);
    click.mockRestore();
  });

  it("sends an import under a nazm-import.csv name", async () => {
    serveApi({ imported: 1, duplicates: 0, validRows: 1, invalidRows: 0 });
    render(<CsvImportScreen locale="en" messages={getMessages("en")} />);
    upload(MT5, "ReportHistory-51234567.html");
    await screen.findByText(/MT5 report converted/i);
    fireEvent.click(screen.getByRole("button", { name: /import valid rows/i }));
    await screen.findByText(/1 trade imported/i);
    expect(importBody().filename).toBe("nazm-import.csv");
  });
});

describe("CsvImportScreen with MetaTrader 5 reports", () => {
  it("accepts HTML reports as well as CSV", () => {
    render(<CsvImportScreen locale="en" messages={getMessages("en")} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.accept).toContain(".html");
  });

  it("converts an uploaded MT5 report and says what it did", async () => {
    serveApi({ imported: 0, duplicates: 0, validRows: 0, invalidRows: 0 });
    render(<CsvImportScreen locale="en" messages={getMessages("en")} />);
    upload(MT5, "ReportHistory-51234567.html");
    expect(await screen.findByText(/MT5 report converted: 1 closed position/i)).toBeInTheDocument();
    expect(screen.getByText(/1 balance row skipped/i)).toBeInTheDocument();
    const textarea = screen.getByRole("textbox", { name: /content/i }) as HTMLTextAreaElement;
    expect(textarea.value.startsWith("symbol,market,side,status")).toBe(true);
  });

  it("says how many positions were already in the journal and skipped", async () => {
    serveApi({ imported: 1, duplicates: 2, validRows: 3, invalidRows: 0 });
    render(<CsvImportScreen locale="en" messages={getMessages("en")} />);
    upload(MT5, "ReportHistory-51234567.html");
    await screen.findByText(/MT5 report converted/i);

    fireEvent.click(screen.getByRole("button", { name: /import valid rows/i }));

    expect(await screen.findByText(/1 trade imported into the journal\. 2 already in the journal were skipped\./)).toBeInTheDocument();
  });

  it("marks the rows the server found already in the journal", async () => {
    serveApi({
      imported: 0,
      duplicates: 1,
      validRows: 1,
      invalidRows: 0,
      preview: [{ rowNumber: 2, isValid: true, duplicate: true, errors: [] }]
    });
    render(<CsvImportScreen locale="en" messages={getMessages("en")} />);
    upload(MT5, "ReportHistory-51234567.html");
    await screen.findByText(/MT5 report converted/i);

    fireEvent.click(screen.getByRole("button", { name: /preview import/i }));

    expect((await screen.findAllByText("Already in the journal")).length).toBeGreaterThan(0);
  });

  it("uses the singular for one skipped position", async () => {
    serveApi({ imported: 3, duplicates: 1, validRows: 4, invalidRows: 0 });
    render(<CsvImportScreen locale="en" messages={getMessages("en")} />);
    upload(MT5, "ReportHistory-51234567.html");
    await screen.findByText(/MT5 report converted/i);

    fireEvent.click(screen.getByRole("button", { name: /import valid rows/i }));

    expect(await screen.findByText(/3 trades imported into the journal\. 1 already in the journal was skipped\./)).toBeInTheDocument();
  });

  it("explains an MT5 file exported from the Deals view", async () => {
    render(<CsvImportScreen locale="fa" messages={getMessages("fa")} />);
    upload("Positions\nTime,Position,Symbol,Type,Volume,Price,S / L,T / P,Time,Price,Commission,Swap,Profit\n,,,", "report.csv");
    expect(await screen.findByText(/هیچ ردیف خرید یا فروش/)).toBeInTheDocument();
  });
});

describe("CsvImportScreen broker time zone", () => {
  it("reads MT5 times in the broker time zone from Settings and says so", async () => {
    serveApi({ imported: 1, duplicates: 0, validRows: 1, invalidRows: 0 }, { timezone: "UTC", brokerTimeZone: "Etc/GMT-2" });
    render(<CsvImportScreen locale="en" messages={getMessages("en")} />);
    upload(MT5, "ReportHistory-51234567.html");

    expect(await screen.findByText(/MT5 times are read as broker time: UTC\+2/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /import valid rows/i }));
    await screen.findByText(/1 trade imported/);
    expect(importBody().timeZone).toBe("Etc/GMT-2");
  });

  it("falls back to the New York close convention when Settings cannot be read", async () => {
    serveApi({ imported: 1, duplicates: 0, validRows: 1, invalidRows: 0 }, new Error("offline"));
    render(<CsvImportScreen locale="en" messages={getMessages("en")} />);
    upload(MT5, "ReportHistory-51234567.html");

    expect(await screen.findByText(/broker time: New York close/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /import valid rows/i }));
    await screen.findByText(/1 trade imported/);
    expect(importBody().timeZone).toBe("mt5:new-york-close");
  });

  it("leaves an ordinary CSV's times as they were", async () => {
    serveApi({ imported: 1, duplicates: 0, validRows: 1, invalidRows: 0 });
    render(<CsvImportScreen locale="en" messages={getMessages("en")} />);
    upload("symbol,market,side,entryPrice,quantity,openedAt\nBTCUSDT,crypto,long,60000,0.1,2026-09-01T10:00:00", "trades.csv");
    await screen.findByDisplayValue(/BTCUSDT/);

    fireEvent.click(screen.getByRole("button", { name: /import valid rows/i }));
    await screen.findByText(/1 trade imported/);
    expect(importBody()).not.toHaveProperty("timeZone");
  });
});

describe("CsvImportScreen broker time zone timing", () => {
  it("keeps Import and Preview disabled until the broker time zone is known", async () => {
    let answer: (value: unknown) => void = () => undefined;
    (apiFetch as Mock).mockClear();
    (apiFetch as Mock).mockImplementation((url: string) =>
      url === "/api/users/me/settings" ? new Promise((resolve) => (answer = resolve)) : Promise.resolve({ imported: 1, duplicates: 0, validRows: 1, invalidRows: 0 })
    );
    render(<CsvImportScreen locale="en" messages={getMessages("en")} />);
    upload(MT5, "ReportHistory-51234567.html");
    await screen.findByText(/MT5 report converted/i);

    expect(screen.getByRole("button", { name: /import valid rows/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /preview import/i })).toBeDisabled();

    answer({ settings: { brokerTimeZone: "Etc/GMT-3" } });
    await screen.findByText(/broker time: UTC\+3/);
    expect(screen.getByRole("button", { name: /import valid rows/i })).not.toBeDisabled();
  });

  it("stops reading times as broker time once the CSV text is edited by hand", async () => {
    serveApi({ imported: 1, duplicates: 0, validRows: 1, invalidRows: 0 });
    render(<CsvImportScreen locale="en" messages={getMessages("en")} />);
    upload(MT5, "ReportHistory-51234567.html");
    await screen.findByText(/broker time: New York close/);

    const textarea = screen.getByRole("textbox", { name: /content/i });
    fireEvent.change(textarea, { target: { value: "symbol,market,side,entryPrice,quantity,openedAt\nBTCUSDT,crypto,long,60000,0.1,2026-09-01T10:00:00" } });
    expect(screen.queryByText(/broker time/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /import valid rows/i }));
    await screen.findByText(/1 trade imported/);
    expect(importBody()).not.toHaveProperty("timeZone");
  });
});
