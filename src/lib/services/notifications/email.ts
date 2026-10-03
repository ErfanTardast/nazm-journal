import type { AlertRecord, NotificationPayload } from "@/lib/services/notifications/index";
import { getEmailFrom } from "@/lib/env";

export async function sendEmail(alert: AlertRecord, payload: NotificationPayload): Promise<void> {
  const from = getEmailFrom();
  if (!from) {
    console.log(`[notifications:email] not configured — alert=${alert.id}`);
    return;
  }
  // EMAIL_FROM is set but no SMTP transport is wired yet — log intent until a mailer is added.
  console.log(`[notifications:email] would send from=${from} subject="${payload.title}" alert=${alert.id}`);
}
