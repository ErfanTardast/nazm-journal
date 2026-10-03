import { sendInApp } from "@/lib/services/notifications/in-app";
import { sendWebhook } from "@/lib/services/notifications/webhook";
import { sendTelegram } from "@/lib/services/notifications/telegram";
import { sendDiscord } from "@/lib/services/notifications/discord";
import { sendEmail } from "@/lib/services/notifications/email";

export type NotificationPayload = {
  title: string;
  body: string;
};

export type AlertRecord = {
  id: string;
  userId: string;
  type: string;
  channels: string[];
  message: string;
  condition: unknown;
};

export function safeCondition(condition: unknown): Record<string, unknown> {
  if (condition && typeof condition === "object" && !Array.isArray(condition)) {
    return condition as Record<string, unknown>;
  }
  return {};
}

export async function dispatch(alert: AlertRecord, payload: NotificationPayload): Promise<void> {
  await Promise.allSettled(
    alert.channels.map(async (channel) => {
      switch (channel) {
        case "in_app":
          return sendInApp(alert, payload);
        case "webhook":
          return sendWebhook(alert, payload);
        case "telegram":
          return sendTelegram(alert, payload);
        case "discord":
          return sendDiscord(alert, payload);
        case "email":
          return sendEmail(alert, payload);
        default:
          console.warn(`[notifications] unknown channel: ${channel}`);
      }
    })
  );
}
