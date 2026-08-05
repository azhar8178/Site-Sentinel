import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sitesTable, checkResultsTable } from "@workspace/db/schema";
import { eq, desc, and, gte, count } from "drizzle-orm";
import { checkSite, processCheckResult } from "../services/monitor";
import { requireRole } from "../middleware/auth";

const router: IRouter = Router();

function parseSiteId(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && Number.isInteger(n) ? n : null;
}

router.get("/sites", async (_req, res, next) => {
  try {
    const sites = await db.select().from(sitesTable).orderBy(sitesTable.id);
    res.json(sites);
  } catch (err) { next(err); }
});

router.get("/sites/:siteId", async (req, res, next) => {
  try {
    const siteId = parseSiteId(String(req.params.siteId));
    if (!siteId) { res.status(400).json({ error: "Invalid site ID" }); return; }

    const sites = await db.select().from(sitesTable).where(eq(sitesTable.id, siteId));
    if (sites.length === 0) { res.status(404).json({ error: "Site not found" }); return; }
    res.json(sites[0]);
  } catch (err) { next(err); }
});

router.put("/sites/:siteId", requireRole("editor", "admin"), async (req, res, next) => {
  try {
    const siteId = parseSiteId(String(req.params.siteId));
    if (!siteId) { res.status(400).json({ error: "Invalid site ID" }); return; }

    const { name, url, isActive, slowThresholdMs } = req.body;
    if (slowThresholdMs !== undefined && (typeof slowThresholdMs !== "number" || slowThresholdMs < 100 || slowThresholdMs > 60000)) {
      res.status(400).json({ error: "slowThresholdMs must be a number between 100 and 60000" }); return;
    }
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (url !== undefined) updates.url = url;
    if (isActive !== undefined) updates.isActive = isActive;
    if (slowThresholdMs !== undefined) updates.slowThresholdMs = slowThresholdMs;

    const updated = await db
      .update(sitesTable)
      .set(updates)
      .where(eq(sitesTable.id, siteId))
      .returning();

    if (updated.length === 0) { res.status(404).json({ error: "Site not found" }); return; }
    res.json(updated[0]);
  } catch (err) { next(err); }
});

router.post("/sites/:siteId/check", async (req, res, next) => {
  try {
    const siteId = parseSiteId(String(req.params.siteId));
    if (!siteId) { res.status(400).json({ error: "Invalid site ID" }); return; }

    const sites = await db.select().from(sitesTable).where(eq(sitesTable.id, siteId));
    if (sites.length === 0) { res.status(404).json({ error: "Site not found" }); return; }

    const site = sites[0];
    const result = await checkSite(site);
    await processCheckResult(site, result);

    const checks = await db
      .select()
      .from(checkResultsTable)
      .where(eq(checkResultsTable.siteId, siteId))
      .orderBy(desc(checkResultsTable.checkedAt))
      .limit(1);

    res.json(checks[0]);
  } catch (err) { next(err); }
});

router.get("/sites/:siteId/checks", async (req, res, next) => {
  try {
    const siteId = parseSiteId(String(req.params.siteId));
    if (!siteId) { res.status(400).json({ error: "Invalid site ID" }); return; }

    const hours = Number(req.query.hours) || 24;
    const limit = Math.min(Number(req.query.limit) || 100, 1000);
    const offset = Number(req.query.offset) || 0;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const checks = await db
      .select()
      .from(checkResultsTable)
      .where(
        and(
          eq(checkResultsTable.siteId, siteId),
          gte(checkResultsTable.checkedAt, since)
        )
      )
      .orderBy(desc(checkResultsTable.checkedAt))
      .limit(limit)
      .offset(offset);

    const totalResult = await db
      .select({ total: count() })
      .from(checkResultsTable)
      .where(
        and(
          eq(checkResultsTable.siteId, siteId),
          gte(checkResultsTable.checkedAt, since)
        )
      );

    res.json({
      checks,
      total: totalResult[0]?.total ?? 0,
    });
  } catch (err) { next(err); }
});

export default router;
