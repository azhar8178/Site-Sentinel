import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sitesTable, serversTable, serverMetricsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

const DEFAULT_PAYMENT_GATEWAYS = [
  { id: "1", name: "Stripe", store: "lovefurniture.ie", status: "active", detail: "Live mode, processing" },
  { id: "2", name: "Revolut", store: "lovefurniture.co.uk", status: "active", detail: "Processing successfully" },
  { id: "3", name: "Klarna", store: "Both", status: "active", detail: "Active" },
];

async function getPaymentGateways() {
  try {
    const result = await db.execute(
      "SELECT payment_gateways FROM health_report_config LIMIT 1"
    );
    const row = (result as any).rows?.[0] ?? (result as any)[0] ?? null;
    if (row?.payment_gateways) return row.payment_gateways;
  } catch {
  }
  return DEFAULT_PAYMENT_GATEWAYS;
}

router.get("/health-report", async (_req, res, next) => {
  try {
    const sites = await db.select().from(sitesTable).orderBy(sitesTable.id);
    const servers = await db.select().from(serversTable).orderBy(serversTable.id);

    const latestMetrics: Record<number, typeof serverMetricsTable.$inferSelect> = {};
    for (const server of servers) {
      const metrics = await db
        .select()
        .from(serverMetricsTable)
        .where(eq(serverMetricsTable.serverId, server.id))
        .orderBy(desc(serverMetricsTable.recordedAt))
        .limit(1);
      if (metrics.length > 0) {
        latestMetrics[server.id] = metrics[0];
      }
    }

    const paymentGateways = await getPaymentGateways();

    const now = Date.now();
    const OFFLINE_THRESHOLD_MS = 5 * 60 * 1000;

    const serversWithStatus = servers.map((server) => {
      const lastSeen = server.lastSeenAt ? new Date(server.lastSeenAt).getTime() : 0;
      const isOnline = lastSeen > 0 && now - lastSeen < OFFLINE_THRESHOLD_MS;
      const m = latestMetrics[server.id];
      const memPercent = m ? Math.round((m.memUsedBytes / m.memTotalBytes) * 100) : null;
      const diskPercent = m ? Math.round((m.diskUsedBytes / m.diskTotalBytes) * 100) : null;
      return {
        id: server.id,
        name: server.name,
        hostname: server.hostname,
        isOnline,
        lastSeenAt: server.lastSeenAt,
        metrics: m
          ? { cpuPercent: Math.round(m.cpuPercent), memPercent, diskPercent, loadAvg1m: m.loadAvg1m }
          : null,
      };
    });

    const allSitesUp = sites.every((s) => s.currentStatus === "up");
    const allServersOnline = servers.length === 0 || serversWithStatus.every((s) => s.isOnline);
    const overallStatus = allSitesUp && allServersOnline ? "operational" : "degraded";

    res.json({
      generatedAt: new Date().toISOString(),
      overallStatus,
      sites: sites.map((s) => ({
        id: s.id,
        name: s.name,
        url: s.url,
        currentStatus: s.currentStatus,
        lastResponseTimeMs: s.lastResponseTimeMs,
        lastCheckedAt: s.lastCheckedAt,
      })),
      servers: serversWithStatus,
      paymentGateways,
    });
  } catch (err) {
    next(err);
  }
});

router.put("/health-report/payment-gateways", async (req, res, next) => {
  try {
    const { paymentGateways } = req.body;
    if (!Array.isArray(paymentGateways)) {
      res.status(400).json({ error: "paymentGateways must be an array" });
      return;
    }
    const json = JSON.stringify(paymentGateways).replace(/'/g, "''");
    const existing = await db.execute("SELECT id FROM health_report_config LIMIT 1");
    const row = (existing as any).rows?.[0] ?? (existing as any)[0] ?? null;
    if (row) {
      await db.execute(`UPDATE health_report_config SET payment_gateways = '${json}'::jsonb WHERE id = ${row.id}`);
    } else {
      await db.execute(`INSERT INTO health_report_config (payment_gateways) VALUES ('${json}'::jsonb)`);
    }
    res.json({ paymentGateways });
  } catch (err) {
    next(err);
  }
});

export default router;
