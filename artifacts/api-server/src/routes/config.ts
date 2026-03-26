import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { alertConfigTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

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
        })
        .returning();
      configs = inserted;
    }

    res.json(configs[0]);
  } catch (err) { next(err); }
});

router.put("/config", async (req, res, next) => {
  try {
    const { recipientEmails, senderEmail, isEnabled } = req.body;

    if (recipientEmails !== undefined && typeof recipientEmails !== "string") {
      res.status(400).json({ error: "recipientEmails must be a string" }); return;
    }
    if (senderEmail !== undefined && typeof senderEmail !== "string") {
      res.status(400).json({ error: "senderEmail must be a string" }); return;
    }
    if (isEnabled !== undefined && typeof isEnabled !== "boolean") {
      res.status(400).json({ error: "isEnabled must be a boolean" }); return;
    }

    let configs = await db.select().from(alertConfigTable).limit(1);

    if (configs.length === 0) {
      const inserted = await db
        .insert(alertConfigTable)
        .values({
          recipientEmails: recipientEmails ?? "",
          senderEmail: senderEmail ?? "",
          isEnabled: isEnabled ?? true,
        })
        .returning();
      res.json(inserted[0]);
      return;
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (recipientEmails !== undefined) updates.recipientEmails = recipientEmails;
    if (senderEmail !== undefined) updates.senderEmail = senderEmail;
    if (isEnabled !== undefined) updates.isEnabled = isEnabled;

    const updated = await db
      .update(alertConfigTable)
      .set(updates)
      .where(eq(alertConfigTable.id, configs[0].id))
      .returning();

    res.json(updated[0]);
  } catch (err) { next(err); }
});

export default router;
