import { db } from "@workspace/db";
import { sitesTable, checkResultsTable, alertsTable, alertConfigTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { logger } from "../lib/logger";
import { sendAlertEmail, formatDowntimeAlert, formatSlowAlert, formatRecoveryAlert } from "./email";
import { sendSlackAlert, formatSlackDowntime, formatSlackSlow, formatSlackRecovery } from "./slack";
import { sendWhatsAppAlert, formatWhatsAppDowntime, formatWhatsAppSlow, formatWhatsAppRecovery } from "./whatsapp";

const CHECK_INTERVAL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 30_000;

let intervalId: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

async function checkSite(site: typeof sitesTable.$inferSelect): Promise<{
  statusCode: number | null;
  responseTimeMs: number | null;
  isUp: boolean;
  errorMessage: string | null;
}> {
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(site.url, {
      method: "GET",
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "SiteMonitor/1.0",
      },
    });

    clearTimeout(timeout);
    const responseTimeMs = Date.now() - start;
    const isUp = response.status >= 200 && response.status < 300;

    return {
      statusCode: response.status,
      responseTimeMs,
      isUp,
      errorMessage: isUp ? null : `HTTP ${response.status} ${response.statusText}`,
    };
  } catch (err: unknown) {
    const responseTimeMs = Date.now() - start;
    const message = err instanceof Error ? err.message : "Unknown error";

    return {
      statusCode: null,
      responseTimeMs,
      isUp: false,
      errorMessage: message,
    };
  }
}

async function getAlertConfig() {
  const configs = await db.select().from(alertConfigTable).limit(1);
  return configs[0] ?? null;
}

async function processCheckResult(
  site: typeof sitesTable.$inferSelect,
  result: Awaited<ReturnType<typeof checkSite>>
) {
  await db.insert(checkResultsTable).values({
    siteId: site.id,
    statusCode: result.statusCode,
    responseTimeMs: result.responseTimeMs,
    isUp: result.isUp,
    errorMessage: result.errorMessage,
    checkedAt: new Date(),
  });

  const previousStatus = site.currentStatus;
  const previousFailures = site.consecutiveFailures;

  let newStatus: "up" | "down" | "slow" | "unknown";
  let newFailures: number;

  if (!result.isUp) {
    newStatus = "down";
    newFailures = previousFailures + 1;
  } else if (result.responseTimeMs && result.responseTimeMs > site.slowThresholdMs) {
    newStatus = "slow";
    newFailures = 0;
  } else {
    newStatus = "up";
    newFailures = 0;
  }

  await db
    .update(sitesTable)
    .set({
      currentStatus: newStatus,
      lastCheckedAt: new Date(),
      lastResponseTimeMs: result.responseTimeMs,
      consecutiveFailures: newFailures,
      updatedAt: new Date(),
    })
    .where(eq(sitesTable.id, site.id));

  const config = await getAlertConfig();
  if (!config || !config.isEnabled) return;

  const recipients = config.recipientEmails
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

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

  if (!emailEnabled && !slackActive && whatsappRecipients.length === 0) return;

  if (newStatus === "down" && previousStatus !== "down") {
    const details = result.errorMessage || `HTTP ${result.statusCode}`;
    const alert = formatDowntimeAlert(site.name, site.url, result.statusCode, result.errorMessage);
    const emailSent = emailEnabled
      ? await sendAlertEmail(smtpConfig, config.senderEmail, recipients, alert.subject, alert.html, alert.text)
      : false;

    if (slackActive) {
      await sendSlackAlert(config.slackWebhookUrl, formatSlackDowntime(site.name, site.url, details));
    }
    if (whatsappRecipients.length > 0) {
      await sendWhatsAppAlert(config.whatsappApiToken, config.whatsappPhoneNumberId, whatsappRecipients, formatWhatsAppDowntime(site.name, site.url, details));
    }

    await db.insert(alertsTable).values({
      siteId: site.id,
      alertType: "downtime",
      message: `${site.name} is DOWN. ${details}`,
      responseTimeMs: result.responseTimeMs,
      statusCode: result.statusCode,
      emailSent,
    });

    logger.info({ siteId: site.id, siteName: site.name }, "Downtime alert triggered");
  }

  if (newStatus === "slow" && previousStatus !== "slow") {
    const alert = formatSlowAlert(site.name, site.url, result.responseTimeMs!, site.slowThresholdMs);
    const emailSent = emailEnabled
      ? await sendAlertEmail(smtpConfig, config.senderEmail, recipients, alert.subject, alert.html, alert.text)
      : false;

    if (slackActive) {
      await sendSlackAlert(config.slackWebhookUrl, formatSlackSlow(site.name, site.url, result.responseTimeMs!, site.slowThresholdMs));
    }
    if (whatsappRecipients.length > 0) {
      await sendWhatsAppAlert(config.whatsappApiToken, config.whatsappPhoneNumberId, whatsappRecipients, formatWhatsAppSlow(site.name, site.url, result.responseTimeMs!, site.slowThresholdMs));
    }

    await db.insert(alertsTable).values({
      siteId: site.id,
      alertType: "slow_response",
      message: `${site.name} is SLOW. Response time: ${result.responseTimeMs}ms (threshold: ${site.slowThresholdMs}ms)`,
      responseTimeMs: result.responseTimeMs,
      statusCode: result.statusCode,
      emailSent,
    });

    logger.info({ siteId: site.id, siteName: site.name, responseTimeMs: result.responseTimeMs }, "Slow response alert triggered");
  }

  if (newStatus === "up" && (previousStatus === "down" || previousStatus === "slow")) {
    const alert = formatRecoveryAlert(site.name, site.url, result.responseTimeMs!);
    const emailSent = emailEnabled
      ? await sendAlertEmail(smtpConfig, config.senderEmail, recipients, alert.subject, alert.html, alert.text)
      : false;

    if (slackActive) {
      await sendSlackAlert(config.slackWebhookUrl, formatSlackRecovery(site.name, site.url, result.responseTimeMs!));
    }
    if (whatsappRecipients.length > 0) {
      await sendWhatsAppAlert(config.whatsappApiToken, config.whatsappPhoneNumberId, whatsappRecipients, formatWhatsAppRecovery(site.name, site.url, result.responseTimeMs!));
    }

    await db.insert(alertsTable).values({
      siteId: site.id,
      alertType: "recovery",
      message: `${site.name} has RECOVERED. Response time: ${result.responseTimeMs}ms`,
      responseTimeMs: result.responseTimeMs,
      statusCode: result.statusCode,
      emailSent,
    });

    logger.info({ siteId: site.id, siteName: site.name }, "Recovery alert triggered");
  }
}

async function runChecks() {
  if (isRunning) {
    logger.warn("Previous check cycle still running, skipping");
    return;
  }
  isRunning = true;
  try {
    const sites = await db
      .select()
      .from(sitesTable)
      .where(eq(sitesTable.isActive, true));

    if (sites.length === 0) {
      logger.debug("No active sites to monitor");
      return;
    }

    logger.info({ count: sites.length }, "Running site checks");

    await Promise.allSettled(
      sites.map(async (site) => {
        try {
          const result = await checkSite(site);
          await processCheckResult(site, result);
          logger.info(
            { siteId: site.id, siteName: site.name, isUp: result.isUp, responseTimeMs: result.responseTimeMs },
            "Site check complete"
          );
        } catch (err) {
          logger.error({ err, siteId: site.id }, "Error processing site check");
        }
      })
    );
  } catch (err) {
    logger.error({ err }, "Error running site checks");
  } finally {
    isRunning = false;
  }
}

export function startMonitoring() {
  if (intervalId) {
    logger.warn("Monitoring already running");
    return;
  }

  logger.info({ intervalMs: CHECK_INTERVAL_MS }, "Starting site monitoring");

  runChecks();

  intervalId = setInterval(runChecks, CHECK_INTERVAL_MS);
}

export function stopMonitoring() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info("Monitoring stopped");
  }
}

export { checkSite, processCheckResult };
