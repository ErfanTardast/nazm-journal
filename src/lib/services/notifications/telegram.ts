import { fetchJson } from "@/lib/providers/http";
import type { AlertRecord, NotificationPayload } from "@/lib/services/notifications/index";
import { getTelegramBotToken, getTelegramChatId } from "@/lib/env";

export async function sendTelegram(alert: AlertRecord, payload: NotificationPayload): Promise<void> {
  const token = getTelegramBotToken();
  const chatId = getTelegramChatId();
  if (!token || !chatId) {
    console.log(`[notifications:telegram] not configured — alert=${alert.id}`);
    return;
  }
  try {
    const text = `*${payload.title}*\n${payload.body}`;
    await fetchJson(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
      timeoutMs: 8_000
    });
  } catch (error) {
    console.error(`[notifications:telegram] delivery failed — alert=${alert.id}`, error);
  }
}
