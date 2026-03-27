import { logger } from "../lib/logger";

const WHATSAPP_API_BASE = "https://graph.facebook.com/v21.0";

export async function sendWhatsAppAlert(
  apiToken: string,
  phoneNumberId: string,
  recipients: string[],
  message: string
): Promise<boolean> {
  if (!apiToken || !phoneNumberId || recipients.length === 0) {
    logger.warn("WhatsApp not fully configured, skipping");
    return false;
  }

  let allSent = true;

  for (const recipient of recipients) {
    try {
      const resp = await fetch(
        `${WHATSAPP_API_BASE}/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: recipient.replace(/[^0-9]/g, ""),
            type: "text",
            text: { body: message },
          }),
          signal: AbortSignal.timeout(15000),
        }
      );

      if (!resp.ok) {
        const body = await resp.text();
        logger.error({ status: resp.status, body, recipient }, "WhatsApp send failed");
        allSent = false;
      } else {
        logger.info({ recipient }, "WhatsApp alert sent");
      }
    } catch (err) {
      logger.error({ err, recipient }, "Failed to send WhatsApp message");
      allSent = false;
    }
  }

  return allSent;
}

export async function testWhatsAppConnection(
  apiToken: string,
  phoneNumberId: string,
  testRecipient: string
): Promise<{ success: boolean; error?: string }> {
  if (!apiToken) {
    return { success: false, error: "API token is required" };
  }
  if (!phoneNumberId) {
    return { success: false, error: "Phone Number ID is required" };
  }
  if (!testRecipient) {
    return { success: false, error: "Recipient phone number is required" };
  }

  try {
    const resp = await fetch(
      `${WHATSAPP_API_BASE}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: testRecipient.replace(/[^0-9]/g, ""),
          type: "text",
          text: { body: "Site Monitor test message - WhatsApp integration is working!" },
        }),
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      const errorMsg = (body as any)?.error?.message || `HTTP ${resp.status}`;
      return { success: false, error: errorMsg };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}

export function formatWhatsAppDowntime(siteName: string, siteUrl: string, details: string): string {
  return `ALERT: ${siteName} is DOWN\n\nURL: ${siteUrl}\nStatus: ${details}\nTime: ${new Date().toISOString()}\n\nPlease investigate immediately.`;
}

export function formatWhatsAppSlow(siteName: string, siteUrl: string, responseTimeMs: number, thresholdMs: number): string {
  return `WARNING: ${siteName} is SLOW\n\nURL: ${siteUrl}\nResponse: ${responseTimeMs}ms (threshold: ${thresholdMs}ms)\nTime: ${new Date().toISOString()}`;
}

export function formatWhatsAppRecovery(siteName: string, siteUrl: string, responseTimeMs: number): string {
  return `RECOVERED: ${siteName} is back UP\n\nURL: ${siteUrl}\nResponse: ${responseTimeMs}ms\nTime: ${new Date().toISOString()}`;
}
