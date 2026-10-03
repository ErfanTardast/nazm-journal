import { fetchJson } from "@/lib/providers/http";
import type { AlertRecord, NotificationPayload } from "@/lib/services/notifications/index";
import { safeCondition } from "@/lib/services/notifications/index";

export async function sendWebhook(alert: AlertRecord, payload: NotificationPayload): Promise<void> {
  const condition = safeCondition(alert.condition);
  const url = (condition.webhookUrl as string | undefined) ?? process.env.NOTIFICATION_WEBHOOK_URL;
  if (!url) {
    console.log(`[notifications:webhook] not configured — alert=${alert.id}`);
    return;
  }
  try {
    await fetchJson(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alertId: alert.id, alertType: alert.type, ...payload }),
      timeoutMs: 8_000
    });
  } catch (error) {
    console.error(`[notifications:webhook] delivery failed — alert=${alert.id}`, error);
  }
}
