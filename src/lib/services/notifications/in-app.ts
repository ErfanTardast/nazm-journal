import type { AlertRecord, NotificationPayload } from "@/lib/services/notifications/index";

export async function sendInApp(alert: AlertRecord, payload: NotificationPayload): Promise<void> {
  console.log(`[notifications:in_app] alert=${alert.id} — ${payload.title}`);
}
