import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { alertsTable, sitesTable } from "@workspace/db/schema";
import { serversTable } from "@workspace/db/schema";
import { eq, desc, count, sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/alerts", async (req, res, next) => {
  try {
    const siteId = req.query.siteId ? Number(req.query.siteId) : undefined;
    if (req.query.siteId && (!siteId || !Number.isFinite(siteId))) {
      res.status(400).json({ error: "Invalid siteId" }); return;
    }
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;

    const conditions = siteId ? eq(alertsTable.siteId, siteId) : undefined;

    const rows = await db
      .select({
        id: alertsTable.id,
        siteId: alertsTable.siteId,
        serverId: alertsTable.serverId,
        alertType: alertsTable.alertType,
        message: alertsTable.message,
        responseTimeMs: alertsTable.responseTimeMs,
        statusCode: alertsTable.statusCode,
        emailSent: alertsTable.emailSent,
        createdAt: alertsTable.createdAt,
        _siteName: sitesTable.name,
        _siteUrl: sitesTable.url,
        _serverName: serversTable.name,
        _serverHostname: serversTable.hostname,
      })
      .from(alertsTable)
      .leftJoin(sitesTable, eq(alertsTable.siteId, sitesTable.id))
      .leftJoin(serversTable, eq(alertsTable.serverId, serversTable.id))
      .where(conditions)
      .orderBy(desc(alertsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const alerts = rows.map((r) => ({
      id: r.id,
      siteId: r.siteId,
      serverId: r.serverId,
      siteName: r._siteName ?? "",
      siteUrl: r._siteUrl ?? "",
      serverName: r._serverName ?? "",
      serverHostname: r._serverHostname ?? "",
      alertType: r.alertType,
      message: r.message,
      responseTimeMs: r.responseTimeMs,
      statusCode: r.statusCode,
      emailSent: r.emailSent,
      createdAt: r.createdAt,
    }));

    const totalResult = await db
      .select({ total: count() })
      .from(alertsTable)
      .where(conditions);

    res.json({
      alerts,
      total: totalResult[0]?.total ?? 0,
    });
  } catch (err) { next(err); }
});

export default router;
