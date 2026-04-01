import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { alertConfigTable, magentoConfigTable, serverAlertConfigTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { testSmtpConnection, sendAlertEmail } from "../services/email";
import { testSlackConnection } from "../services/slack";
import { testWhatsAppConnection } from "../services/whatsapp";
import { clearMagentoTokenCache } from "../services/magento";

const router: IRouter = Router();

const SENSITIVE_FIELDS = ["smtpPassword", "slackBotToken", "whatsappApiToken"] as const;
const MASK = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";

function sanitizeConfig(config: typeof alertConfigTable.$inferSelect) {
  const out: Record<string, unknown> = { ...config };
  for (const f of SENSITIVE_FIELDS) {
    out[f] = (config as any)[f] ? MASK : "";
  }
  return out;
}

function sanitizeMagentoConfig(config: typeof magentoConfigTable.$inferSelect) {
  return {
    ...config,
    adminPass: config.adminPass ? MASK : "",
    apiToken: config.apiToken ? MASK : "",
  };
}

async function getOrCreateConfig() {
  let configs = await db.select().from(alertConfigTable).limit(1);
  if (configs.length === 0) {
    configs = await db.insert(alertConfigTable).values({}).returning();
  }
  return configs[0];
}

async function getOrCreateMagentoConfig() {
  let configs = await db.select().from(magentoConfigTable).limit(1);
  if (configs.length === 0) {
    configs = await db.insert(magentoConfigTable).values({}).returning();
  }
  return configs[0];
}

router.get("/config", async (_req, res, next) => {
  try {
    const config = await getOrCreateConfig();
    res.json(sanitizeConfig(config));
  } catch (err) { next(err); }
});

router.put("/config", async (req, res, next) => {
  try {
    const config = await getOrCreateConfig();
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    const allowedStrings = [
      "recipientEmails", "senderEmail", "smtpHost", "smtpUsername", "smtpPassword",
      "slackBotToken", "slackChannel",
      "whatsappApiToken", "whatsappPhoneNumberId", "whatsappRecipients",
    ];
    const allowedBooleans = ["isEnabled", "smtpSecure", "slackEnabled", "whatsappEnabled"];
    const allowedNumbers = ["smtpPort"];

    for (const key of allowedStrings) {
      if (req.body[key] !== undefined) {
        if (typeof req.body[key] !== "string") {
          res.status(400).json({ error: `${key} must be a string` }); return;
        }
        if (key === "smtpPassword" && req.body[key] === MASK) continue;
        if (key === "slackBotToken" && req.body[key] === MASK) continue;
        if (key === "whatsappApiToken" && req.body[key] === MASK) continue;
        updates[key] = req.body[key];
      }
    }
    for (const key of allowedBooleans) {
      if (req.body[key] !== undefined) {
        if (typeof req.body[key] !== "boolean") {
          res.status(400).json({ error: `${key} must be a boolean` }); return;
        }
        updates[key] = req.body[key];
      }
    }
    for (const key of allowedNumbers) {
      if (req.body[key] !== undefined) {
        if (typeof req.body[key] !== "number") {
          res.status(400).json({ error: `${key} must be a number` }); return;
        }
        updates[key] = req.body[key];
      }
    }

    const updated = await db
      .update(alertConfigTable)
      .set(updates)
      .where(eq(alertConfigTable.id, config.id))
      .returning();

    res.json(sanitizeConfig(updated[0]));
  } catch (err) { next(err); }
});

router.post("/config/test-smtp", async (req, res, next) => {
  try {
    const { smtpHost, smtpPort, smtpUsername, smtpPassword, smtpSecure } = req.body;

    if (!smtpHost || typeof smtpHost !== "string") {
      res.status(400).json({ error: "smtpHost is required" }); return;
    }

    let password = smtpPassword;
    if (password === MASK || !password) {
      const config = await getOrCreateConfig();
      password = config.smtpPassword;
    }

    const result = await testSmtpConnection({
      smtpHost,
      smtpPort: smtpPort ?? 587,
      smtpUsername: smtpUsername ?? "",
      smtpPassword: password ?? "",
      smtpSecure: smtpSecure ?? false,
    });

    res.json(result);
  } catch (err) { next(err); }
});

router.post("/config/test-email", async (req, res, next) => {
  try {
    const config = await getOrCreateConfig();

    let password = config.smtpPassword;
    if (req.body.smtpPassword && req.body.smtpPassword !== MASK) {
      password = req.body.smtpPassword;
    }

    const smtpConfig = {
      smtpHost: req.body.smtpHost || config.smtpHost,
      smtpPort: req.body.smtpPort ?? config.smtpPort,
      smtpUsername: req.body.smtpUsername ?? config.smtpUsername,
      smtpPassword: password,
      smtpSecure: req.body.smtpSecure ?? config.smtpSecure,
    };

    const sender = req.body.senderEmail || config.senderEmail;
    const recipientStr = req.body.recipientEmails || config.recipientEmails;
    const recipients = recipientStr.split(",").map((e: string) => e.trim()).filter(Boolean);

    if (!smtpConfig.smtpHost) {
      res.json({ success: false, error: "SMTP host not configured" }); return;
    }
    if (!sender) {
      res.json({ success: false, error: "Sender email not configured" }); return;
    }
    if (recipients.length === 0) {
      res.json({ success: false, error: "No recipient emails configured" }); return;
    }

    const timestamp = new Date().toISOString();
    const subject = "Site Monitor - Test Email";
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #2563EB; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">Test Email</h1>
        </div>
        <div style="background: #EFF6FF; padding: 20px; border: 1px solid #BFDBFE;">
          <p style="font-size: 16px; color: #1E40AF; margin-top: 0;">Your email configuration is working correctly!</p>
          <p style="color: #666;">This test email was sent from Site Monitor at ${timestamp}.</p>
          <p style="color: #666; margin-bottom: 0;">SMTP Host: ${smtpConfig.smtpHost}:${smtpConfig.smtpPort}</p>
        </div>
      </div>
    `;
    const text = `Site Monitor Test Email\n\nYour email configuration is working correctly!\nSent at: ${timestamp}\nSMTP Host: ${smtpConfig.smtpHost}:${smtpConfig.smtpPort}`;

    const sent = await sendAlertEmail(smtpConfig, sender, recipients, subject, html, text);

    if (sent) {
      res.json({ success: true });
    } else {
      res.json({ success: false, error: "Failed to send email. Check server logs for details." });
    }
  } catch (err) { next(err); }
});

router.post("/config/test-slack", async (req, res, next) => {
  try {
    let botToken = req.body.slackBotToken;
    let channel = req.body.slackChannel;

    if (!botToken || botToken === MASK || !channel) {
      const config = await getOrCreateConfig();
      if (!botToken || botToken === MASK) botToken = config.slackBotToken;
      if (!channel) channel = config.slackChannel;
    }

    const result = await testSlackConnection(botToken, channel);
    res.json(result);
  } catch (err) { next(err); }
});

router.post("/config/test-whatsapp", async (req, res, next) => {
  try {
    let apiToken = req.body.whatsappApiToken;
    let phoneNumberId = req.body.whatsappPhoneNumberId;
    const testRecipient = req.body.testRecipient;

    if (apiToken === MASK || !apiToken || !phoneNumberId) {
      const config = await getOrCreateConfig();
      if (!apiToken || apiToken === MASK) apiToken = config.whatsappApiToken;
      if (!phoneNumberId) phoneNumberId = config.whatsappPhoneNumberId;
    }

    if (!testRecipient) {
      res.status(400).json({ error: "testRecipient phone number is required" }); return;
    }

    const result = await testWhatsAppConnection(apiToken, phoneNumberId, testRecipient);
    res.json(result);
  } catch (err) { next(err); }
});

router.get("/config/magento", async (_req, res, next) => {
  try {
    const config = await getOrCreateMagentoConfig();
    res.json(sanitizeMagentoConfig(config));
  } catch (err) { next(err); }
});

router.put("/config/magento", async (req, res, next) => {
  try {
    const config = await getOrCreateMagentoConfig();
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    const fields = ["apiUrl", "adminUser", "adminPass", "apiToken"];
    for (const key of fields) {
      if (req.body[key] !== undefined && typeof req.body[key] === "string") {
        if ((key === "adminPass" || key === "apiToken") && req.body[key] === MASK) continue;
        updates[key] = req.body[key];
      }
    }
    if (req.body.isEnabled !== undefined && typeof req.body.isEnabled === "boolean") {
      updates.isEnabled = req.body.isEnabled;
    }

    const updated = await db
      .update(magentoConfigTable)
      .set(updates)
      .where(eq(magentoConfigTable.id, config.id))
      .returning();

    clearMagentoTokenCache();

    res.json(sanitizeMagentoConfig(updated[0]));
  } catch (err) { next(err); }
});

router.post("/config/test-magento", async (req, res, next) => {
  try {
    let { apiUrl, adminUser, adminPass, apiToken } = req.body;

    const stored = await getOrCreateMagentoConfig();
    if (!apiUrl) apiUrl = stored.apiUrl;
    if (!adminUser) adminUser = stored.adminUser;
    if (!adminPass || adminPass === MASK) adminPass = stored.adminPass;
    if (!apiToken || apiToken === MASK) apiToken = stored.apiToken;

    if (!apiUrl) {
      res.json({ success: false, error: "Magento API URL is required" }); return;
    }

    const baseUrl = apiUrl.replace(/\/rest\/V1\/?$/, "").replace(/\/$/, "");

    let token = apiToken;
    if (adminUser && adminPass) {
      try {
        const tokenResp = await fetch(`${baseUrl}/rest/V1/integration/admin/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: adminUser, password: adminPass }),
          signal: AbortSignal.timeout(15000),
        });
        if (tokenResp.ok) {
          token = (await tokenResp.json()) as string;
        } else {
          const body = await tokenResp.text();
          res.json({ success: false, error: `Auth failed (${tokenResp.status}): ${body}` }); return;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        if (!token) {
          res.json({ success: false, error: `Cannot reach Magento token endpoint: ${msg}` }); return;
        }
      }
    }

    if (!token) {
      res.json({ success: false, error: "No valid token. Provide admin credentials or API token." }); return;
    }

    try {
      const storeResp = await fetch(`${baseUrl}/rest/V1/store/storeConfigs`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15000),
      });

      if (!storeResp.ok) {
        res.json({ success: false, error: `Store API returned ${storeResp.status}` }); return;
      }

      const stores = await storeResp.json() as any[];
      const storeNames = stores.map((s: any) => s.store_name || s.code).join(", ");

      await db
        .update(magentoConfigTable)
        .set({ lastTestAt: new Date(), lastTestStatus: "success" })
        .where(eq(magentoConfigTable.id, (await getOrCreateMagentoConfig()).id));

      res.json({ success: true, stores: storeNames });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      res.json({ success: false, error: `Cannot reach Magento API: ${msg}` });
    }
  } catch (err) { next(err); }
});

const GOOGLE_MASK = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";

async function getOrCreateGoogleOAuthConfig() {
  const rows = await db.execute(
    "SELECT id, client_id, client_secret FROM google_oauth_config ORDER BY id DESC LIMIT 1"
  );
  const row = (rows as any).rows?.[0] ?? (rows as any)[0] ?? null;
  if (row) return row as { id: number; client_id: string; client_secret: string };
  await db.execute("INSERT INTO google_oauth_config DEFAULT VALUES");
  const rows2 = await db.execute(
    "SELECT id, client_id, client_secret FROM google_oauth_config ORDER BY id DESC LIMIT 1"
  );
  const row2 = (rows2 as any).rows?.[0] ?? (rows2 as any)[0] ?? null;
  return row2 as { id: number; client_id: string; client_secret: string };
}

router.get("/config/google-analytics", async (_req, res, next) => {
  try {
    const cfg = await getOrCreateGoogleOAuthConfig();
    res.json({
      clientId: cfg.client_id || "",
      clientSecret: cfg.client_secret ? GOOGLE_MASK : "",
      hasCredentials: !!(cfg.client_id && cfg.client_secret),
    });
  } catch (err) { next(err); }
});

router.put("/config/google-analytics", async (req, res, next) => {
  try {
    const cfg = await getOrCreateGoogleOAuthConfig();
    const { clientId, clientSecret } = req.body;
    const updates: string[] = [];
    if (clientId !== undefined && typeof clientId === "string") {
      updates.push(`client_id = '${clientId.replace(/'/g, "''")}'`);
    }
    if (clientSecret !== undefined && typeof clientSecret === "string" && clientSecret !== GOOGLE_MASK) {
      updates.push(`client_secret = '${clientSecret.replace(/'/g, "''")}'`);
    }
    if (updates.length > 0) {
      updates.push(`updated_at = now()`);
      await db.execute(`UPDATE google_oauth_config SET ${updates.join(", ")} WHERE id = ${cfg.id}`);
    }
    const updated = await getOrCreateGoogleOAuthConfig();
    res.json({
      clientId: updated.client_id || "",
      clientSecret: updated.client_secret ? GOOGLE_MASK : "",
      hasCredentials: !!(updated.client_id && updated.client_secret),
    });
  } catch (err) { next(err); }
});

async function getOrCreateHealthReportConfig() {
  const rows = await db.execute(
    "SELECT id, company_name, ie_payment_gateways, uk_payment_gateways FROM health_report_config ORDER BY id DESC LIMIT 1"
  );
  const row = (rows as any).rows?.[0] ?? (rows as any)[0] ?? null;
  if (row) return row as { id: number; company_name: string; ie_payment_gateways: any[]; uk_payment_gateways: any[] };
  await db.execute("INSERT INTO health_report_config DEFAULT VALUES");
  const rows2 = await db.execute(
    "SELECT id, company_name, ie_payment_gateways, uk_payment_gateways FROM health_report_config ORDER BY id DESC LIMIT 1"
  );
  const row2 = (rows2 as any).rows?.[0] ?? (rows2 as any)[0] ?? null;
  return row2 as { id: number; company_name: string; ie_payment_gateways: any[]; uk_payment_gateways: any[] };
}

router.get("/config/health-report", async (_req, res, next) => {
  try {
    const cfg = await getOrCreateHealthReportConfig();
    res.json({
      companyName: cfg.company_name || "Love Furniture",
      iePaymentGateways: cfg.ie_payment_gateways || [],
      ukPaymentGateways: cfg.uk_payment_gateways || [],
    });
  } catch (err) { next(err); }
});

router.put("/config/health-report", async (req, res, next) => {
  try {
    const cfg = await getOrCreateHealthReportConfig();
    const { companyName, iePaymentGateways, ukPaymentGateways } = req.body;
    const updates: string[] = [];
    if (companyName !== undefined && typeof companyName === "string") {
      updates.push(`company_name = '${companyName.replace(/'/g, "''")}'`);
    }
    if (iePaymentGateways !== undefined && Array.isArray(iePaymentGateways)) {
      const json = JSON.stringify(iePaymentGateways).replace(/'/g, "''");
      updates.push(`ie_payment_gateways = '${json}'::jsonb`);
    }
    if (ukPaymentGateways !== undefined && Array.isArray(ukPaymentGateways)) {
      const json = JSON.stringify(ukPaymentGateways).replace(/'/g, "''");
      updates.push(`uk_payment_gateways = '${json}'::jsonb`);
    }
    if (updates.length > 0) {
      updates.push(`updated_at = now()`);
      await db.execute(`UPDATE health_report_config SET ${updates.join(", ")} WHERE id = ${cfg.id}`);
    }
    const updated = await getOrCreateHealthReportConfig();
    res.json({
      companyName: updated.company_name || "Love Furniture",
      iePaymentGateways: updated.ie_payment_gateways || [],
      ukPaymentGateways: updated.uk_payment_gateways || [],
    });
  } catch (err) { next(err); }
});

async function getOrCreateServerAlertConfig() {
  let configs = await db.select().from(serverAlertConfigTable).limit(1);
  if (configs.length === 0) {
    configs = await db.insert(serverAlertConfigTable).values({}).returning();
  }
  return configs[0];
}

router.get("/config/server-alerts", async (_req, res, next) => {
  try {
    const config = await getOrCreateServerAlertConfig();
    res.json(config);
  } catch (err) { next(err); }
});

router.put("/config/server-alerts", async (req, res, next) => {
  try {
    const config = await getOrCreateServerAlertConfig();
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    const allowedBooleans = ["isEnabled"];
    const allowedNumbers = ["cpuThreshold", "ramThreshold", "diskThreshold", "offlineTimeoutMinutes"];

    for (const key of allowedBooleans) {
      if (req.body[key] !== undefined) {
        if (typeof req.body[key] !== "boolean") {
          res.status(400).json({ error: `${key} must be a boolean` }); return;
        }
        updates[key] = req.body[key];
      }
    }
    for (const key of allowedNumbers) {
      if (req.body[key] !== undefined) {
        if (typeof req.body[key] !== "number") {
          res.status(400).json({ error: `${key} must be a number` }); return;
        }
        updates[key] = req.body[key];
      }
    }

    const updated = await db
      .update(serverAlertConfigTable)
      .set(updates)
      .where(eq(serverAlertConfigTable.id, config.id))
      .returning();

    res.json(updated[0]);
  } catch (err) { next(err); }
});

export default router;
