import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sitesTable, serversTable, serverMetricsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

const DEFAULT_IE_GATEWAYS = [
  { id: "ie-1", name: "Stripe", status: "active", detail: "Live mode, processing" },
  { id: "ie-2", name: "Klarna", status: "active", detail: "Active" },
];

const DEFAULT_UK_GATEWAYS = [
  { id: "uk-1", name: "Revolut", status: "active", detail: "Processing successfully" },
  { id: "uk-2", name: "Klarna", status: "active", detail: "Active" },
];

async function getHealthReportConfig() {
  try {
    const result = await db.execute(
      "SELECT id, company_name, ie_payment_gateways, uk_payment_gateways FROM health_report_config LIMIT 1"
    );
    const row = (result as any).rows?.[0] ?? (result as any)[0] ?? null;
    if (row) {
      return {
        id: row.id as number,
        companyName: (row.company_name as string) || "Love Furniture",
        iePaymentGateways: (row.ie_payment_gateways as any[]) || DEFAULT_IE_GATEWAYS,
        ukPaymentGateways: (row.uk_payment_gateways as any[]) || DEFAULT_UK_GATEWAYS,
      };
    }
  } catch {
  }
  return {
    id: null,
    companyName: "Love Furniture",
    iePaymentGateways: DEFAULT_IE_GATEWAYS,
    ukPaymentGateways: DEFAULT_UK_GATEWAYS,
  };
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

    const config = await getHealthReportConfig();

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
          ? {
              cpuPercent: Math.round(m.cpuPercent),
              memPercent,
              diskPercent,
              loadAvg1m: m.loadAvg1m,
              loadAvg5m: m.loadAvg5m,
              loadAvg15m: m.loadAvg15m,
              connectionCount: m.connectionCount,
              httpConnectionCount: m.httpConnectionCount,
            }
          : null,
        services: m
          ? {
              phpFpm: m.phpFpm ?? null,
              mysql: m.mysql ?? null,
              nginx: m.nginx ?? null,
              varnish: m.varnish ?? null,
              elasticsearch: m.elasticsearch ?? null,
              sslExpiry: m.sslExpiry ?? null,
            }
          : null,
      };
    });

    const allSitesUp = sites.every((s) => s.currentStatus === "up");
    const allServersOnline = servers.length === 0 || serversWithStatus.every((s) => s.isOnline);
    const overallStatus = allSitesUp && allServersOnline ? "operational" : "degraded";

    res.json({
      generatedAt: new Date().toISOString(),
      overallStatus,
      companyName: config.companyName,
      sites: sites.map((s) => ({
        id: s.id,
        name: s.name,
        url: s.url,
        currentStatus: s.currentStatus,
        lastResponseTimeMs: s.lastResponseTimeMs,
        lastCheckedAt: s.lastCheckedAt,
      })),
      servers: serversWithStatus,
      iePaymentGateways: config.iePaymentGateways,
      ukPaymentGateways: config.ukPaymentGateways,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
