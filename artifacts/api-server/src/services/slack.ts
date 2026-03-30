import { logger } from "../lib/logger";

export async function sendSlackAlert(
  botToken: string,
  channel: string,
  message: {
    title: string;
    text: string;
    color: string;
    fields?: Array<{ title: string; value: string; short?: boolean }>;
  }
): Promise<boolean> {
  if (!botToken || !channel) {
    logger.warn("Slack bot token or channel not configured, skipping");
    return false;
  }

  try {
    const payload = {
      channel,
      attachments: [
        {
          color: message.color,
          title: message.title,
          text: message.text,
          fields: message.fields?.map((f) => ({
            title: f.title,
            value: f.value,
            short: f.short ?? true,
          })),
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };

    const resp = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${botToken}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });

    const data = await resp.json() as any;

    if (!data.ok) {
      logger.error({ error: data.error }, "Slack API error");
      return false;
    }

    logger.info("Slack alert sent");
    return true;
  } catch (err) {
    logger.error({ err }, "Failed to send Slack alert");
    return false;
  }
}

export async function testSlackConnection(
  botToken: string,
  channel: string
): Promise<{ success: boolean; error?: string }> {
  if (!botToken) {
    return { success: false, error: "Bot token is required" };
  }
  if (!channel) {
    return { success: false, error: "Channel is required" };
  }

  try {
    const payload = {
      channel,
      text: "Site Monitor test message - Slack integration is working!",
    };

    const resp = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${botToken}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });

    const data = await resp.json() as any;

    if (!data.ok) {
      return { success: false, error: `Slack API: ${data.error}` };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}

export function formatSlackDowntime(siteName: string, siteUrl: string, details: string) {
  return {
    title: `ALERT: ${siteName} is DOWN`,
    text: `${siteUrl} is not responding.\n${details}`,
    color: "#DC2626",
    fields: [
      { title: "Site", value: siteName, short: true },
      { title: "Status", value: "DOWN", short: true },
      { title: "URL", value: siteUrl, short: false },
      { title: "Details", value: details, short: false },
    ],
  };
}

export function formatSlackSlow(siteName: string, siteUrl: string, responseTimeMs: number, thresholdMs: number) {
  return {
    title: `WARNING: ${siteName} is SLOW (${responseTimeMs}ms)`,
    text: `${siteUrl} response time exceeds threshold.`,
    color: "#D97706",
    fields: [
      { title: "Site", value: siteName, short: true },
      { title: "Response Time", value: `${responseTimeMs}ms`, short: true },
      { title: "Threshold", value: `${thresholdMs}ms`, short: true },
    ],
  };
}

export function formatSlackRecovery(siteName: string, siteUrl: string, responseTimeMs: number) {
  return {
    title: `RECOVERED: ${siteName} is back UP`,
    text: `${siteUrl} is responding normally again.`,
    color: "#059669",
    fields: [
      { title: "Site", value: siteName, short: true },
      { title: "Response Time", value: `${responseTimeMs}ms`, short: true },
      { title: "Status", value: "UP", short: true },
    ],
  };
}
