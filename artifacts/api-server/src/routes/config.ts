import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { alertConfigTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { testSmtpConnection } from "../services/email";

const router: IRouter = Router();

function sanitizeConfig(config: typeof alertConfigTable.$inferSelect) {
  return {
    ...config,
    smtpPassword: config.smtpPassword ? "••••••••" : "",
  };
}

router.get("/config", async (_req, res, next) => {
  try {
    let configs = await db.select().from(alertConfigTable).limit(1);

    if (configs.length === 0) {
      const inserted = await db
        .insert(alertConfigTable)
        .values({
          recipientEmails: "",
          senderEmail: "",
          isEnabled: true,
          smtpHost: "",
          smtpPort: 587,
          smtpUsername: "",
          smtpPassword: "",
          smtpSecure: false,
        })
        .returning();
      configs = inserted;
    }

    res.json(sanitizeConfig(configs[0]));
  } catch (err) { next(err); }
});

router.put("/config", async (req, res, next) => {
  try {
    const { recipientEmails, senderEmail, isEnabled, smtpHost, smtpPort, smtpUsername, smtpPassword, smtpSecure } = req.body;

    if (recipientEmails !== undefined && typeof recipientEmails !== "string") {
      res.status(400).json({ error: "recipientEmails must be a string" }); return;
    }
    if (senderEmail !== undefined && typeof senderEmail !== "string") {
      res.status(400).json({ error: "senderEmail must be a string" }); return;
    }
    if (isEnabled !== undefined && typeof isEnabled !== "boolean") {
      res.status(400).json({ error: "isEnabled must be a boolean" }); return;
    }
    if (smtpHost !== undefined && typeof smtpHost !== "string") {
      res.status(400).json({ error: "smtpHost must be a string" }); return;
    }
    if (smtpPort !== undefined && typeof smtpPort !== "number") {
      res.status(400).json({ error: "smtpPort must be a number" }); return;
    }
    if (smtpUsername !== undefined && typeof smtpUsername !== "string") {
      res.status(400).json({ error: "smtpUsername must be a string" }); return;
    }
    if (smtpPassword !== undefined && typeof smtpPassword !== "string") {
      res.status(400).json({ error: "smtpPassword must be a string" }); return;
    }
    if (smtpSecure !== undefined && typeof smtpSecure !== "boolean") {
      res.status(400).json({ error: "smtpSecure must be a boolean" }); return;
    }

    let configs = await db.select().from(alertConfigTable).limit(1);

    if (configs.length === 0) {
      const inserted = await db
        .insert(alertConfigTable)
        .values({
          recipientEmails: recipientEmails ?? "",
          senderEmail: senderEmail ?? "",
          isEnabled: isEnabled ?? true,
          smtpHost: smtpHost ?? "",
          smtpPort: smtpPort ?? 587,
          smtpUsername: smtpUsername ?? "",
          smtpPassword: smtpPassword ?? "",
          smtpSecure: smtpSecure ?? false,
        })
        .returning();
      res.json(sanitizeConfig(inserted[0]));
      return;
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (recipientEmails !== undefined) updates.recipientEmails = recipientEmails;
    if (senderEmail !== undefined) updates.senderEmail = senderEmail;
    if (isEnabled !== undefined) updates.isEnabled = isEnabled;
    if (smtpHost !== undefined) updates.smtpHost = smtpHost;
    if (smtpPort !== undefined) updates.smtpPort = smtpPort;
    if (smtpUsername !== undefined) updates.smtpUsername = smtpUsername;
    if (smtpPassword !== undefined && smtpPassword !== "••••••••") updates.smtpPassword = smtpPassword;
    if (smtpSecure !== undefined) updates.smtpSecure = smtpSecure;

    const updated = await db
      .update(alertConfigTable)
      .set(updates)
      .where(eq(alertConfigTable.id, configs[0].id))
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
    if (password === "••••••••" || !password) {
      const configs = await db.select().from(alertConfigTable).limit(1);
      if (configs.length > 0) {
        password = configs[0].smtpPassword;
      }
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

export default router;
