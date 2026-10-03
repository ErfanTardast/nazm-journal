import { fetchJson } from "@/lib/providers/http";
import type { AlertRecord, NotificationPayload } from "@/lib/services/notifications/index";
import { getDiscordWebhookUrl } from "@/lib/env";

export async function sendDiscord(alert: AlertRecord, payload: NotificationPayload): Promise<void> {
  const webhookUrl = getDiscordWebhookUrl();
  if (!webhookUrl) {
    console.log(`[notifications:discord] not configured — alert=${alert.id}`);
    return;
  }
  try {
    await fetchJson(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: `**${payload.title}**\n${payload.body}` }),
      timeoutMs: 8_000
    });
  } catch (error) {
    console.error(`[notifications:discord] delivery failed — alert=${alert.id}`, error);
  }
}
