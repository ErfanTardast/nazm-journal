import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatch, type AlertRecord, type NotificationPayload } from "@/lib/services/notifications";

function makeAlert(channels: string[], condition: Record<string, unknown> = {}): AlertRecord {
  return { id: "alert-1", userId: "u1", type: "journal_reminder", channels, message: "Review ready.", condition };
}

const payload: NotificationPayload = { title: "Test", body: "Test body" };

function mockFetch(ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok, json: async () => ({}), text: async () => "" })
  );
}

describe("dispatch", () => {
  afterEach(() => vi.restoreAllMocks());

  it("resolves when all channels succeed", async () => {
    mockFetch();
    await expect(dispatch(makeAlert(["in_app"]), payload)).resolves.toBeUndefined();
  });

  it("resolves even when a channel throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(dispatch(makeAlert(["webhook"], { webhookUrl: "https://hook.example.com" }), payload)).resolves.toBeUndefined();
  });

  it("dispatches multiple channels concurrently without throwing", async () => {
    mockFetch();
    vi.stubEnv("DISCORD_WEBHOOK_URL", "https://discord.example.com/webhook");
    await expect(dispatch(makeAlert(["in_app", "discord"]), payload)).resolves.toBeUndefined();
    vi.unstubAllEnvs();
  });

  it("handles unknown channel gracefully", async () => {
    await expect(dispatch(makeAlert(["unknown_channel"]), payload)).resolves.toBeUndefined();
  });
});

describe("webhook channel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("POSTs to condition.webhookUrl when present", async () => {
    mockFetch();
    const alert = makeAlert(["webhook"], { webhookUrl: "https://hook.example.com/receive" });
    await dispatch(alert, payload);
    expect(fetch).toHaveBeenCalledWith(
      "https://hook.example.com/receive",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("falls back to NOTIFICATION_WEBHOOK_URL env when condition has no URL", async () => {
    mockFetch();
    vi.stubEnv("NOTIFICATION_WEBHOOK_URL", "https://env-hook.example.com");
    await dispatch(makeAlert(["webhook"]), payload);
    expect(fetch).toHaveBeenCalledWith(
      "https://env-hook.example.com",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("does not call fetch when no URL is available", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await dispatch(makeAlert(["webhook"]), payload);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("telegram channel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("POSTs to the Telegram sendMessage endpoint when configured", async () => {
    mockFetch();
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "bot-token-123");
    vi.stubEnv("TELEGRAM_CHAT_ID", "chat-456");
    await dispatch(makeAlert(["telegram"]), payload);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("api.telegram.org"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("does not call fetch when token is missing", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await dispatch(makeAlert(["telegram"]), payload);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("discord channel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("POSTs to the Discord webhook URL when configured", async () => {
    mockFetch();
    vi.stubEnv("DISCORD_WEBHOOK_URL", "https://discord.com/api/webhooks/123/abc");
    await dispatch(makeAlert(["discord"]), payload);
    expect(fetch).toHaveBeenCalledWith(
      "https://discord.com/api/webhooks/123/abc",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("does not call fetch when URL is missing", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await dispatch(makeAlert(["discord"]), payload);
    expect(fetch).not.toHaveBeenCalled();
  });
});
