import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, type FakeDb } from "./support/fake-db";

const holder = vi.hoisted(() => ({ prisma: {} as Record<string, unknown> }));
vi.mock("@/lib/db/prisma", () => ({ prisma: holder.prisma }));
vi.mock("@/lib/services/alerts", () => ({ createAlert: vi.fn(async () => ({ id: "alert-1", message: "reminder", condition: {} })) }));
vi.mock("@/lib/services/notifications", () => ({ dispatch: vi.fn(async () => undefined) }));

import { createAlert } from "@/lib/services/alerts";
import { generateReview, updateReview } from "@/lib/services/reviews";
import { loadSampleWorkspace, removeSampleWorkspace } from "@/lib/services/sample-workspace";

/**
 * A review made while sample data is loaded is made from sample numbers, so it is a sample row too: it carries the
 * label, is left out of the export, and goes when the sample goes. It must never become the person's own review.
 */
const NOW = new Date("2026-10-02T09:30:00.000Z");
const A = "user-a";
const WEEK = { periodStart: new Date("2026-09-21T00:00:00Z"), periodEnd: new Date("2026-09-27T23:59:59Z") };

let db: FakeDb;

beforeEach(() => {
  db = fakeDb({ user: [{ id: A, sampleLoadedAt: null }] });
  Object.assign(holder.prisma, db.client);
  vi.mocked(createAlert).mockClear();
});

const reviews = () => db.rows("review");
const userRow = () => db.rows("user").find((row) => row.id === A) as Record<string, unknown>;

describe("a generated review", () => {
  it("is a sample review while sample data is loaded: labelled, and gone with the sample", async () => {
    await loadSampleWorkspace(A, "en", NOW);

    const { review } = await generateReview(A, { type: "weekly", createReminder: false, ...WEEK }, "en");

    expect(review).toMatchObject({ userId: A, isSample: true });
    expect(review.title).toMatch(/\(sample\)$/);
    expect(reviews()).toHaveLength(3);

    await removeSampleWorkspace(A);

    expect(reviews()).toHaveLength(0);
    expect(userRow().sampleLoadedAt).toBeNull();
  });

  it("is left out of what the export reads (the person's own reviews)", async () => {
    await loadSampleWorkspace(A, "en", NOW);
    await generateReview(A, { type: "weekly", createReminder: false, ...WEEK }, "en");

    // The export asks for `{ userId, isSample: false }`.
    expect(await db.client.review.findMany({ where: { userId: A, isSample: false } })).toHaveLength(0);
  });

  it("carries the Persian label on a Persian page", async () => {
    await loadSampleWorkspace(A, "fa", NOW);

    const { review } = await generateReview(A, { type: "daily", createReminder: false }, "fa");

    expect(review).toMatchObject({ isSample: true });
    expect(review.title).toMatch(/\(نمونه\)$/);
  });

  it("makes no reminder for a sample review, since the review will be removed and the reminder would be left behind", async () => {
    await loadSampleWorkspace(A, "en", NOW);

    const { reminder } = await generateReview(A, { type: "weekly", createReminder: true, ...WEEK }, "en");

    expect(reminder).toBeNull();
    expect(createAlert).not.toHaveBeenCalled();
  });

  it("is the person's own review when no sample data is loaded, with no label and a reminder when asked", async () => {
    const { review, reminder } = await generateReview(A, { type: "weekly", createReminder: true, ...WEEK }, "en");

    expect(review).toMatchObject({ userId: A, isSample: false });
    expect(review.title).not.toMatch(/sample/i);
    expect(reminder).not.toBeNull();
    expect(createAlert).toHaveBeenCalledTimes(1);

    // Nothing to remove: the review stays when someone asks to remove sample data.
    await removeSampleWorkspace(A);
    expect(reviews()).toHaveLength(1);
  });
});

describe("a carry-forward review", () => {
  it("made from a sample review is a sample review, and goes with the sample", async () => {
    await loadSampleWorkspace(A, "en", NOW);
    const daily = reviews().find((row) => row.type === "daily" && row.isSample === true) as Record<string, unknown>;

    const { carryForwardReview } = await updateReview(A, { id: String(daily.id), status: "completed", carryForward: true }, "en");

    expect(carryForwardReview).toMatchObject({ userId: A, isSample: true });
    expect(carryForwardReview?.title).toMatch(/\(sample\)$/);
    // It copied links to sample trades; those links must not outlive the trades.
    expect((carryForwardReview?.linkedTradeIds as string[]).length).toBeGreaterThan(0);

    await removeSampleWorkspace(A);

    expect(reviews()).toHaveLength(0);
  });

  it("made from the person's own review is their own", async () => {
    reviews().push({
      id: "own-review",
      userId: A,
      isSample: false,
      type: "daily",
      status: "open",
      title: "Daily review 2026-09-30",
      periodStart: new Date("2026-09-30T00:00:00Z"),
      periodEnd: new Date("2026-09-30T23:59:59.999Z"),
      lessons: ["Wait for the close"],
      nextActions: ["Keep the stop"],
      risks: [],
      linkedTradeIds: [],
      linkedStrategyIds: []
    });

    const { carryForwardReview } = await updateReview(A, { id: "own-review", status: "completed", carryForward: true }, "en");

    expect(carryForwardReview).toMatchObject({ userId: A, isSample: false });
    expect(carryForwardReview?.title).not.toMatch(/sample/i);
  });
});
