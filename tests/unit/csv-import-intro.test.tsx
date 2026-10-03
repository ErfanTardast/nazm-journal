import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";
import { englishLeaks } from "./support/english-leaks";

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, apiFetch: vi.fn() };
});
import { ApiClientError, apiFetch } from "@/lib/api/client";
import { CsvImportScreen } from "@/features/import/csv-import-screen";

// A test can hand the screen preview rows the real validator would not produce (several rules on one column, a row-wide rule).
let previewOverride: (() => unknown[]) | null = null;
vi.mock("@/lib/import/csv", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/import/csv")>();
  return {
    ...actual,
    previewTradeCsv: ((...args: Parameters<typeof actual.previewTradeCsv>) => (previewOverride ? previewOverride() : actual.previewTradeCsv(...args))) as typeof actual.previewTradeCsv
  };
});

const en = getMessages("en");
const fa = getMessages("fa");

afterEach(() => {
  cleanup();
  previewOverride = null;
  (apiFetch as Mock).mockReset();
});

// The column names the importer maps (symbol, entryPrice, ...) are CSV headers: they stay as the trader's file spells them.
const COLUMN_NAMES = [
  "symbol",
  "market",
  "side",
  "entryPrice",
  "quantity",
  "openedAt",
  "status",
  "exitPrice",
  "stopLoss",
  "takeProfit",
  "fees",
  "closedAt",
  "session",
  "setupType",
  "emotionalState",
  "mistakes",
  "tags",
  "notes",
  "postTradeNotes",
  "lessonsLearned",
  "ruleFollowed"
];

// Product audit, 2026-10-01 (item 11): the first screen of the import page says what to upload and what happens to it.
// Claims checked against the code: externalId ("mt5:<account>:<position>") makes a repeated or overlapping MT5 report skip
// known positions (importTradesFromCsv), and legs sharing a ladderKey form one entry in the metrics (calculations/ladders.ts).
describe("the import page explains what to upload", () => {
  it("English: the MT5 history report, one trade for a laddered entry, no duplicates on a repeat upload", () => {
    const { container } = render(<CsvImportScreen locale="en" messages={en} />);
    expect(container.textContent).toContain(
      "Upload your MT5 history report and check the preview before anything is saved. Positions that make up one laddered entry count as one trade, and uploading the same MT5 report again, or an overlapping one, adds no duplicates."
    );
  });

  it("Persian: the same, in Persian", () => {
    const { container } = render(<CsvImportScreen locale="fa" messages={fa} />);
    expect(container.textContent).toContain(
      "گزارش تاریخچه MT5 را بارگذاری کنید و پیش از ذخیره، پیش‌نمایش را بررسی کنید. پوزیشن‌هایی که یک ورود پلکانی را می‌سازند یک معامله حساب می‌شوند و بارگذاری دوباره همان گزارش MT5 یا گزارشی هم‌پوشان، معامله تکراری اضافه نمی‌کند."
    );
  });

  it.each([
    ["en", en],
    ["fa", fa]
  ] as const)("%s: no developer wording on the first screen", (locale, messages) => {
    const { container } = render(<CsvImportScreen locale={locale} messages={messages} />);
    expect(container.textContent).not.toMatch(/\bAPI\b|backend|row-level|workflow/i);
    expect(container.textContent).not.toContain("بک‌اند");
  });

  // The page says to upload the MT5 report, so the upload control cannot be called a CSV file only.
  it("English: the upload control is named for the MT5 report as well as a CSV file", () => {
    render(<CsvImportScreen locale="en" messages={en} />);
    expect(screen.getByText("MT5 report or CSV file")).toBeInTheDocument();
    expect(screen.getByText("Choose the MT5 report or a CSV file")).toBeInTheDocument();
    expect(screen.queryByText("Select CSV file")).toBeNull();
    expect(screen.queryByText("Choose a CSV file")).toBeNull();
  });

  it("Persian: the same", () => {
    render(<CsvImportScreen locale="fa" messages={fa} />);
    expect(screen.getByText("گزارش MT5 یا فایل CSV")).toBeInTheDocument();
    expect(screen.getByText("انتخاب گزارش MT5 یا فایل CSV")).toBeInTheDocument();
    expect(screen.queryByText("انتخاب فایل CSV")).toBeNull();
  });

  it("names the preview button without saying API", () => {
    render(<CsvImportScreen locale="en" messages={en} />);
    expect(screen.getByRole("button", { name: "Preview import" })).toBeInTheDocument();
    cleanup();
    render(<CsvImportScreen locale="fa" messages={fa} />);
    expect(screen.getByRole("button", { name: "پیش‌نمایش ورود" })).toBeInTheDocument();
  });
});

describe("the import page in Persian", () => {
  it("has no English left except the CSV column names", () => {
    const { container } = render(<CsvImportScreen locale="fa" messages={fa} />);
    const mt5Menus = [/History/g, /Positions/g, /Report/g, /HTML/g];
    expect(englishLeaks(container, [...COLUMN_NAMES, ...mt5Menus])).toEqual([]);
  });

  it("has no English in the preview table", () => {
    const { container } = render(<CsvImportScreen locale="fa" messages={fa} />);
    fireEvent.click(screen.getByRole("button", { name: /بارگذاری داده نمونه/ }));
    const mt5Menus = [/History/g, /Positions/g, /Report/g, /HTML/g];
    // The CSV text box holds the trader's own data; everything around it is the page. The sample's symbols are tickers.
    const page = container.cloneNode(true) as HTMLElement;
    page.querySelectorAll("textarea").forEach((box) => box.remove());
    expect(englishLeaks(page, [...COLUMN_NAMES, ...mt5Menus, "BTCUSDT", "EURUSD", "AAPL"])).toEqual([]);
  });

  // The validator's own text is English ("Invalid input: expected number, received NaN"); the page names the columns instead.
  const BAD_ROW_CSV = [
    "symbol,market,side,status,entryPrice,quantity,openedAt",
    "BTCUSDT,crypto,long,open,abc,x,2026-06-10T09:00:00.000Z"
  ].join("\n");

  function pasteBadRow(locale: "en" | "fa") {
    const rendered = render(<CsvImportScreen locale={locale} messages={locale === "fa" ? fa : en} />);
    fireEvent.change(rendered.container.querySelector("textarea") as HTMLTextAreaElement, { target: { value: BAD_ROW_CSV } });
    return rendered;
  }

  it("Persian: an invalid row names the columns to check, with no validator text", () => {
    const { container } = pasteBadRow("fa");
    expect(container.textContent).toContain("این ستون‌ها را بررسی کنید: entryPrice، quantity");
    expect(container.textContent).not.toMatch(/Invalid|expected|received|NaN/);
    const page = container.cloneNode(true) as HTMLElement;
    page.querySelectorAll("textarea").forEach((box) => box.remove());
    expect(englishLeaks(page, [...COLUMN_NAMES, /History/g, /Positions/g, /Report/g, /HTML/g, "BTCUSDT"])).toEqual([]);
  });

  it("English: an invalid row names the columns to check, with no validator text", () => {
    const { container } = pasteBadRow("en");
    expect(container.textContent).toContain("Check these columns: entryPrice, quantity");
    expect(container.textContent).not.toMatch(/Invalid input|expected|received|NaN/);
  });

  it("names a column once however many rules it broke, and says so plainly when no column is named", () => {
    const row = (errors: string[]) => ({ rowNumber: 2, raw: {}, mapped: { symbol: "BTCUSDT" }, isValid: false, errors });
    previewOverride = () => [row(["entryPrice: Too small", "entryPrice: Invalid input", "quantity: Too small"]), row([": Something about the whole row"])];
    const { container } = render(<CsvImportScreen locale="en" messages={en} />);
    fireEvent.change(container.querySelector("textarea") as HTMLTextAreaElement, { target: { value: "x" } });
    expect(screen.getAllByText("Check these columns: entryPrice, quantity").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Check the values in this row.").length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/Too small|Invalid input|Something about/);
  });

  it("shows a Persian line when the import fails, never the server's text", async () => {
    (apiFetch as Mock).mockRejectedValue(new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR"));
    render(<CsvImportScreen locale="fa" messages={fa} />);
    fireEvent.click(screen.getByRole("button", { name: /بارگذاری داده نمونه/ }));
    fireEvent.click(screen.getByRole("button", { name: "ورود ردیف‌های معتبر" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/[؀-ۿ]/);
    expect(alert.textContent).not.toContain("Unexpected server error");
    expect(englishLeaks(alert)).toEqual([]);
  });

  it("English: a server error says the import failed", async () => {
    (apiFetch as Mock).mockRejectedValue(new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR"));
    render(<CsvImportScreen locale="en" messages={en} />);
    fireEvent.click(screen.getByRole("button", { name: /^load sample/i }));
    fireEvent.click(screen.getByRole("button", { name: /import valid rows/i }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The import did not go through");
    expect(alert.textContent).not.toContain("Unexpected server error");
  });
});
