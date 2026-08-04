import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { alertsTable, sitesTable } from "@workspace/db/schema";
import { serversTable, serverMetricsTable } from "@workspace/db/schema";
import { eq, desc, count } from "drizzle-orm";
import OpenAI from "openai";

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
        incidentTimeline: alertsTable.incidentTimeline,
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
      hasTimeline: r.incidentTimeline != null,
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

router.post("/alerts/:id/incident-analysis", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid alert ID" });
      return;
    }

    const rows = await db
      .select({
        id: alertsTable.id,
        serverId: alertsTable.serverId,
        alertType: alertsTable.alertType,
        message: alertsTable.message,
        incidentTimeline: alertsTable.incidentTimeline,
        createdAt: alertsTable.createdAt,
        _serverName: serversTable.name,
        _serverHostname: serversTable.hostname,
      })
      .from(alertsTable)
      .leftJoin(serversTable, eq(alertsTable.serverId, serversTable.id))
      .where(eq(alertsTable.id, id))
      .limit(1);

    if (rows.length === 0) {
      res.status(404).json({ error: "Alert not found" });
      return;
    }

    const alert = rows[0];

    if (!alert.incidentTimeline) {
      res.status(400).json({ error: "This alert has no captured incident timeline" });
      return;
    }

    if (!process.env.OPENAI_API_KEY) {
      res.status(503).json({ error: "AI analysis is not configured on the API server" });
      return;
    }

    const timeline = alert.incidentTimeline as Record<string, unknown>;
    const metricsArr = Array.isArray(timeline.metrics) ? timeline.metrics : [];
    const snapshotsArr = Array.isArray(timeline.logSnapshots) ? timeline.logSnapshots : [];

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      max_output_tokens: 1800,
      instructions: [
        "You are a senior Linux, Nginx, Varnish, PHP-FPM, MySQL, and Magento production incident analyst.",
        "You are given telemetry and sanitized logs captured automatically around the time of an alert event.",
        "Analyze only the supplied data. Do not invent facts.",
        "Return concise Markdown with exactly these headings: Summary, Evidence, Likely causes, Recommended checks, Severity.",
        "Separate observed evidence from hypotheses. Prioritize actionable checks and mention when evidence is insufficient.",
        "Never request credentials, API keys, or unrestricted server access.",
      ].join(" "),
      input: JSON.stringify({
        alert: {
          id: alert.id,
          alertType: alert.alertType,
          message: alert.message,
          firedAt: alert.createdAt,
          server: {
            id: alert.serverId,
            name: alert._serverName ?? "unknown",
            hostname: alert._serverHostname ?? "unknown",
          },
        },
        capturedAt: timeline.capturedAt,
        windowMinutes: timeline.windowMinutes,
        metrics: metricsArr.slice(-60),
        logSnapshots: snapshotsArr.slice(-3),
      }),
    });

    res.json({
      analysis: response.output_text,
      generatedAt: new Date().toISOString(),
      snapshotCount: snapshotsArr.length,
      metricsCount: metricsArr.length,
    });
  } catch (err) { next(err); }
});

export default router;
