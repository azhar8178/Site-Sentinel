import { db } from "@workspace/db";
import { serversTable, serverMetricsTable, alertsTable, alertConfigTable, serverAlertConfigTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { logger } from "../lib/logger";
import { sendAlertEmail } from "./email";
import { sendSlackAlert } from "./slack";
import { sendWhatsAppAlert } from "./whatsapp";

const CHECK_INTERVAL_MS = 60_000;

let intervalId: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

type ServerAlertState = "normal" | "cpu_high" | "ram_high" | "disk_high" | "offline";

const previousStates = new Map<number, Set<ServerAlertState>>();

function getStates(serverId: number): Set<ServerAlertState> {
  if (!previousStates.has(serverId)) {
    previousStates.set(serverId, new Set());
  }
  return previousStates.get(serverId)!;
}

async function getServerAlertConfig() {
  const configs = await db.select().from(serverAlertConfigTable).limit(1);
  if (configs.length === 0) {
    const inserted = await db.insert(serverAlertConfigTable).values({}).returning();
    return inserted[0];
  }
  return configs[0];
}

async function getAlertConfig() {
  const configs = await db.select().from(alertConfigTable).limit(1);
  return configs[0] ?? null;
}

function formatServerAlertEmail(
  serverName: string, hostname: string, alertType: string, details: string, isRecovery: boolean
): { subject: string; html: string; text: string } {
  const status = isRecovery ? "RECOVERED" : "ALERT";
  const subject = `${status}: Server ${serverName} - ${alertType}`;
  const timestamp = new Date().toISOString();
  const color = isRecovery ? "#059669" : "#DC2626";
  const bgColor = isRecovery ? "#ECFDF5" : "#FEF2F2";
  const borderColor = isRecovery ? "#A7F3D0" : "#FECACA";
  const textColor = isRecovery ? "#065F46" : "#991B1B";

  const text = `${status}: Server ${serverName} (${hostname})\n\n${alertType}: ${details}\nTime: ${timestamp}`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: ${color}; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 24px;">Server ${isRecovery ? "Recovered" : "Alert"}</h1>
      </div>
      <div style="background: ${bgColor}; padding: 20px; border: 1px solid ${borderColor};">
        <p style="font-size: 18px; font-weight: 600; color: ${textColor}; margin-top: 0;">${serverName} - ${alertType}</p>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px 0; color: #666; width: 100px;">Server</td><td style="padding: 8px 0; font-weight: 500;">${serverName}</td></tr>
          <tr><td style="padding: 8px 0; color: #666;">Hostname</td><td style="padding: 8px 0; font-weight: 500;">${hostname}</td></tr>
          <tr><td style="padding: 8px 0; color: #666;">Details</td><td style="padding: 8px 0; font-weight: 500;">${details}</td></tr>
          <tr><td style="padding: 8px 0; color: #666;">Time</td><td style="padding: 8px 0; font-weight: 500;">${timestamp}</td></tr>
        </table>
      </div>
    </div>
  `;

  return { subject, html, text };
}

function formatServerSlackAlert(
  serverName: string, hostname: string, alertType: string, details: string, isRecovery: boolean
) {
  return {
    title: `${isRecovery ? "RECOVERED" : "ALERT"}: Server ${serverName} - ${alertType}`,
    text: `${hostname}: ${details}`,
    color: isRecovery ? "#059669" : "#DC2626",
    fields: [
      { title: "Server", value: serverName, short: true },
      { title: "Hostname", value: hostname, short: true },
      { title: "Type", value: alertType, short: true },
      { title: "Details", value: details, short: false },
    ],
  };
}

function formatServerWhatsAppAlert(
  serverName: string, hostname: string, alertType: string, details: string, isRecovery: boolean
): string {
  const status = isRecovery ? "RECOVERED" : "ALERT";
  return `${status}: Server ${serverName}\n\nHostname: ${hostname}\nType: ${alertType}\nDetails: ${details}\nTime: ${new Date().toISOString()}`;
}

async function dispatchServerAlert(
  serverId: number,
  serverName: string,
  hostname: string,
  dbAlertType: "cpu_high" | "ram_high" | "disk_high" | "server_offline" | "server_recovery",
  displayType: string,
  details: string,
  isRecovery: boolean
) {
  const config = await getAlertConfig();
  if (!config || !config.isEnabled) {
    await db.insert(alertsTable).values({
      serverId,
      alertType: dbAlertType,
      message: `Server ${serverName}: ${displayType} - ${details}`,
      emailSent: false,
    });
    return;
  }

  const recipients = config.recipientEmails.split(",").map((e: string) => e.trim()).filter(Boolean);
  const emailEnabled = recipients.length > 0 && !!config.smtpHost;
  const smtpConfig = {
    smtpHost: config.smtpHost,
    smtpPort: config.smtpPort,
    smtpUsername: config.smtpUsername,
    smtpPassword: config.smtpPassword,
    smtpSecure: config.smtpSecure,
  };
  const slackActive = config.slackEnabled && !!config.slackWebhookUrl;
  const whatsappRecipients = config.whatsappEnabled && config.whatsappRecipients
    ? config.whatsappRecipients.split(",").map((r: string) => r.trim()).filter(Boolean)
    : [];

  const emailData = formatServerAlertEmail(serverName, hostname, displayType, details, isRecovery);
  const emailSent = emailEnabled
    ? await sendAlertEmail(smtpConfig, config.senderEmail, recipients, emailData.subject, emailData.html, emailData.text)
    : false;

  if (slackActive) {
    await sendSlackAlert(config.slackWebhookUrl, formatServerSlackAlert(serverName, hostname, displayType, details, isRecovery));
  }
  if (whatsappRecipients.length > 0) {
    await sendWhatsAppAlert(
      config.whatsappApiToken, config.whatsappPhoneNumberId, whatsappRecipients,
      formatServerWhatsAppAlert(serverName, hostname, displayType, details, isRecovery)
    );
  }

  await db.insert(alertsTable).values({
    serverId,
    alertType: dbAlertType,
    message: `Server ${serverName}: ${displayType} - ${details}`,
    emailSent,
  });

  logger.info({ serverId, serverName, alertType: dbAlertType, isRecovery }, "Server alert dispatched");
}

async function checkServerVitals() {
  if (isRunning) {
    logger.warn("Previous server vitals check still running, skipping");
    return;
  }
  isRunning = true;

  try {
    const serverAlertConfig = await getServerAlertConfig();
    if (!serverAlertConfig.isEnabled) {
      return;
    }

    const servers = await db
      .select()
      .from(serversTable)
      .where(eq(serversTable.isActive, true));

    if (servers.length === 0) {
      return;
    }

    for (const server of servers) {
      try {
        const states = getStates(server.id);

        const now = new Date();
        const offlineThreshold = new Date(now.getTime() - serverAlertConfig.offlineTimeoutMinutes * 60 * 1000);
        const isOffline = !server.lastSeenAt || server.lastSeenAt < offlineThreshold;

        if (isOffline) {
          if (!states.has("offline")) {
            states.add("offline");
            const minutesAgo = server.lastSeenAt
              ? Math.round((now.getTime() - server.lastSeenAt.getTime()) / 60000)
              : -1;
            const details = server.lastSeenAt
              ? `Last seen ${minutesAgo} minutes ago (threshold: ${serverAlertConfig.offlineTimeoutMinutes}min)`
              : `Never reported metrics`;
            await dispatchServerAlert(server.id, server.name, server.hostname, "server_offline", "Server Offline", details, false);
          }
          continue;
        }

        if (states.has("offline")) {
          states.delete("offline");
          await dispatchServerAlert(server.id, server.name, server.hostname, "server_recovery", "Back Online", "Server is reporting metrics again", true);
        }

        const latestMetrics = await db
          .select()
          .from(serverMetricsTable)
          .where(eq(serverMetricsTable.serverId, server.id))
          .orderBy(desc(serverMetricsTable.recordedAt))
          .limit(1);

        if (latestMetrics.length === 0) continue;
        const metrics = latestMetrics[0];

        const cpuPercent = metrics.cpuPercent;
        const ramPercent = metrics.memTotalBytes > 0 ? (metrics.memUsedBytes / metrics.memTotalBytes) * 100 : 0;
        const diskPercent = metrics.diskTotalBytes > 0 ? (metrics.diskUsedBytes / metrics.diskTotalBytes) * 100 : 0;

        if (cpuPercent > serverAlertConfig.cpuThreshold) {
          if (!states.has("cpu_high")) {
            states.add("cpu_high");
            await dispatchServerAlert(server.id, server.name, server.hostname, "cpu_high", "CPU High",
              `CPU at ${cpuPercent.toFixed(1)}% (threshold: ${serverAlertConfig.cpuThreshold}%)`, false);
          }
        } else if (states.has("cpu_high")) {
          states.delete("cpu_high");
          await dispatchServerAlert(server.id, server.name, server.hostname, "server_recovery", "CPU Recovered",
            `CPU back to ${cpuPercent.toFixed(1)}%`, true);
        }

        if (ramPercent > serverAlertConfig.ramThreshold) {
          if (!states.has("ram_high")) {
            states.add("ram_high");
            await dispatchServerAlert(server.id, server.name, server.hostname, "ram_high", "RAM High",
              `RAM at ${ramPercent.toFixed(1)}% (threshold: ${serverAlertConfig.ramThreshold}%)`, false);
          }
        } else if (states.has("ram_high")) {
          states.delete("ram_high");
          await dispatchServerAlert(server.id, server.name, server.hostname, "server_recovery", "RAM Recovered",
            `RAM back to ${ramPercent.toFixed(1)}%`, true);
        }

        if (diskPercent > serverAlertConfig.diskThreshold) {
          if (!states.has("disk_high")) {
            states.add("disk_high");
            await dispatchServerAlert(server.id, server.name, server.hostname, "disk_high", "Disk High",
              `Disk at ${diskPercent.toFixed(1)}% (threshold: ${serverAlertConfig.diskThreshold}%)`, false);
          }
        } else if (states.has("disk_high")) {
          states.delete("disk_high");
          await dispatchServerAlert(server.id, server.name, server.hostname, "server_recovery", "Disk Recovered",
            `Disk back to ${diskPercent.toFixed(1)}%`, true);
        }
      } catch (err) {
        logger.error({ err, serverId: server.id }, "Error checking server vitals");
      }
    }
  } catch (err) {
    logger.error({ err }, "Error running server vitals check");
  } finally {
    isRunning = false;
  }
}

export function startServerMonitoring() {
  if (intervalId) {
    logger.warn("Server monitoring already running");
    return;
  }

  logger.info({ intervalMs: CHECK_INTERVAL_MS }, "Starting server vitals monitoring");
  checkServerVitals();
  intervalId = setInterval(checkServerVitals, CHECK_INTERVAL_MS);
}

export function stopServerMonitoring() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info("Server vitals monitoring stopped");
  }
}
