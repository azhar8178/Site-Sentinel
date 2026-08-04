import { Router, type IRouter } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import { serversTable, serverMetricsTable, serverLogSnapshotsTable } from "@workspace/db/schema";
import { eq, desc, and, gte, lt } from "drizzle-orm";
import { requireRole } from "../middleware/auth";
import OpenAI from "openai";

function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

function clampNum(val: unknown, min: number, max: number, fallback: number): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export const serversRouter: IRouter = Router();

serversRouter.get("/servers", async (_req, res, next) => {
  try {
    const servers = await db
      .select({
        id: serversTable.id,
        name: serversTable.name,
        hostname: serversTable.hostname,
        isActive: serversTable.isActive,
        lastSeenAt: serversTable.lastSeenAt,
        createdAt: serversTable.createdAt,
      })
      .from(serversTable)
      .orderBy(serversTable.name);

    const result = await Promise.all(
      servers.map(async (server) => {
        const latest = await db
          .select()
          .from(serverMetricsTable)
          .where(eq(serverMetricsTable.serverId, server.id))
          .orderBy(desc(serverMetricsTable.recordedAt))
          .limit(1);

        return {
          ...server,
          latestMetrics: latest[0] ?? null,
        };
      })
    );

    res.json(result);
  } catch (err) {
    next(err);
  }
});

serversRouter.get("/servers/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid server ID" });
      return;
    }

    const servers = await db
      .select({
        id: serversTable.id,
        name: serversTable.name,
        hostname: serversTable.hostname,
        isActive: serversTable.isActive,
        lastSeenAt: serversTable.lastSeenAt,
        createdAt: serversTable.createdAt,
      })
      .from(serversTable)
      .where(eq(serversTable.id, id))
      .limit(1);

    if (servers.length === 0) {
      res.status(404).json({ error: "Server not found" });
      return;
    }

    const server = servers[0];
    const latest = await db
      .select()
      .from(serverMetricsTable)
      .where(eq(serverMetricsTable.serverId, id))
      .orderBy(desc(serverMetricsTable.recordedAt))
      .limit(1);

    res.json({
      ...server,
      latestMetrics: latest[0] ?? null,
    });
  } catch (err) {
    next(err);
  }
});

serversRouter.get("/servers/:id/metrics", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid server ID" });
      return;
    }

    const hours = Math.max(1, Math.min(168, Number(req.query.hours) || 1));
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const metrics = await db
      .select()
      .from(serverMetricsTable)
      .where(
        and(
          eq(serverMetricsTable.serverId, id),
          gte(serverMetricsTable.recordedAt, since)
        )
      )
      .orderBy(serverMetricsTable.recordedAt);

    res.json(metrics);
  } catch (err) {
    next(err);
  }
});

serversRouter.get("/servers/:id/log-snapshots", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid server ID" });
      return;
    }

    const hours = Math.max(1, Math.min(24, Number(req.query.hours) || 6));
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const snapshots = await db
      .select()
      .from(serverLogSnapshotsTable)
      .where(and(eq(serverLogSnapshotsTable.serverId, id), gte(serverLogSnapshotsTable.recordedAt, since)))
      .orderBy(serverLogSnapshotsTable.recordedAt);

    res.json(snapshots);
  } catch (err) {
    next(err);
  }
});

serversRouter.post("/servers/:id/incident-analysis", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid server ID" });
      return;
    }

    const hours = Math.max(1, Math.min(24, Number(req.body?.hours) || 6));
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const [server] = await db.select({
      id: serversTable.id,
      name: serversTable.name,
      hostname: serversTable.hostname,
    }).from(serversTable).where(eq(serversTable.id, id)).limit(1);

    if (!server) {
      res.status(404).json({ error: "Server not found" });
      return;
    }

    const [metrics, snapshots] = await Promise.all([
      db.select().from(serverMetricsTable)
        .where(and(eq(serverMetricsTable.serverId, id), gte(serverMetricsTable.recordedAt, since)))
        .orderBy(serverMetricsTable.recordedAt),
      db.select().from(serverLogSnapshotsTable)
        .where(and(eq(serverLogSnapshotsTable.serverId, id), gte(serverLogSnapshotsTable.recordedAt, since)))
        .orderBy(serverLogSnapshotsTable.recordedAt),
    ]);

    if (!process.env.OPENAI_API_KEY) {
      res.status(503).json({ error: "AI analysis is not configured on the API server" });
      return;
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.responses.create({
      model: "gpt-5.4-mini",
      max_output_tokens: 1800,
      instructions: [
        "You are a senior Linux, Nginx, Varnish, PHP-FPM, MySQL, and Magento production incident analyst.",
        "Analyze only the supplied telemetry and sanitized logs. Do not invent facts.",
        "Return concise Markdown with exactly these headings: Summary, Evidence, Likely causes, Recommended checks, Severity.",
        "Separate observed evidence from hypotheses. Prioritize actionable checks and mention when evidence is insufficient.",
        "Never request credentials, API keys, or unrestricted server access.",
      ].join(" "),
      input: JSON.stringify({
        server,
        windowHours: hours,
        metrics: metrics.slice(-720),
        logSnapshots: snapshots.slice(-24),
      }),
    });

    res.json({
      analysis: response.output_text,
      generatedAt: new Date().toISOString(),
      snapshotCount: snapshots.length,
      windowHours: hours,
    });
  } catch (err) {
    next(err);
  }
});

serversRouter.post("/servers", requireRole("editor", "admin"), async (req, res, next) => {
  try {
    const { name, hostname } = req.body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    if (!hostname || typeof hostname !== "string" || hostname.trim().length === 0) {
      res.status(400).json({ error: "hostname is required" });
      return;
    }

    const rawKey = `sm_${crypto.randomBytes(24).toString("hex")}`;
    const hashedKey = hashApiKey(rawKey);

    const inserted = await db
      .insert(serversTable)
      .values({ name: name.trim(), hostname: hostname.trim(), apiKey: hashedKey })
      .returning({
        id: serversTable.id,
        name: serversTable.name,
        hostname: serversTable.hostname,
        isActive: serversTable.isActive,
        lastSeenAt: serversTable.lastSeenAt,
        createdAt: serversTable.createdAt,
      });

    res.status(201).json({
      ...inserted[0],
      apiKey: rawKey,
    });
  } catch (err) {
    next(err);
  }
});

serversRouter.put("/servers/:id", requireRole("editor", "admin"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid server ID" });
      return;
    }

    const { name, hostname } = req.body;
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (name && typeof name === "string" && name.trim().length > 0) updates.name = name.trim();
    if (hostname && typeof hostname === "string" && hostname.trim().length > 0) updates.hostname = hostname.trim();

    if (Object.keys(updates).length <= 1) {
      res.status(400).json({ error: "Provide name or hostname to update" });
      return;
    }

    const updated = await db.update(serversTable).set(updates).where(eq(serversTable.id, id)).returning({
      id: serversTable.id,
      name: serversTable.name,
      hostname: serversTable.hostname,
      isActive: serversTable.isActive,
      lastSeenAt: serversTable.lastSeenAt,
      createdAt: serversTable.createdAt,
    });

    if (updated.length === 0) {
      res.status(404).json({ error: "Server not found" });
      return;
    }

    res.json(updated[0]);
  } catch (err) {
    next(err);
  }
});

serversRouter.post("/servers/:id/regenerate-key", requireRole("admin"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid server ID" });
      return;
    }

    const rawKey = `sm_${crypto.randomBytes(24).toString("hex")}`;
    const hashedKey = hashApiKey(rawKey);

    const updated = await db.update(serversTable).set({ apiKey: hashedKey, updatedAt: new Date() }).where(eq(serversTable.id, id)).returning({ id: serversTable.id });

    if (updated.length === 0) {
      res.status(404).json({ error: "Server not found" });
      return;
    }

    res.json({ apiKey: rawKey });
  } catch (err) {
    next(err);
  }
});

serversRouter.delete("/servers/:id", requireRole("editor", "admin"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid server ID" });
      return;
    }

    const deleted = await db.delete(serversTable).where(eq(serversTable.id, id)).returning({ id: serversTable.id });
    if (deleted.length === 0) {
      res.status(404).json({ error: "Server not found" });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export const reportRouter: IRouter = Router();

reportRouter.post("/servers/report", async (req, res, next) => {
  try {
    const rawKey = req.headers["x-api-key"] as string;

    if (!rawKey || typeof rawKey !== "string") {
      res.status(401).json({ error: "x-api-key header required" });
      return;
    }

    const hashedKey = hashApiKey(rawKey);
    const servers = await db
      .select()
      .from(serversTable)
      .where(eq(serversTable.apiKey, hashedKey))
      .limit(1);

    if (servers.length === 0) {
      res.status(401).json({ error: "Invalid API key" });
      return;
    }

    const server = servers[0];
    const b = req.body;

    if (!b || typeof b !== "object") {
      res.status(400).json({ error: "Request body required" });
      return;
    }

    const cpuPercent = clampNum(b.cpuPercent, 0, 100, 0);
    const memUsedBytes = clampNum(b.memUsedBytes, 0, Number.MAX_SAFE_INTEGER, 0);
    const memTotalBytes = clampNum(b.memTotalBytes, 0, Number.MAX_SAFE_INTEGER, 0);
    const diskUsedBytes = clampNum(b.diskUsedBytes, 0, Number.MAX_SAFE_INTEGER, 0);
    const diskTotalBytes = clampNum(b.diskTotalBytes, 0, Number.MAX_SAFE_INTEGER, 0);
    const netRxBytes = clampNum(b.netRxBytes, 0, Number.MAX_SAFE_INTEGER, 0);
    const netTxBytes = clampNum(b.netTxBytes, 0, Number.MAX_SAFE_INTEGER, 0);
    const loadAvg1m = clampNum(b.loadAvg1m, 0, 10000, 0);
    const loadAvg5m = clampNum(b.loadAvg5m, 0, 10000, 0);
    const loadAvg15m = clampNum(b.loadAvg15m, 0, 10000, 0);

    const topProcesses = Array.isArray(b.topProcesses) ? b.topProcesses.slice(0, 10) : null;
    const phpFpm = b.phpFpm && typeof b.phpFpm === "object" ? b.phpFpm : null;
    const mysql = b.mysql && typeof b.mysql === "object" ? b.mysql : null;
    const processCount = b.processCount ? clampNum(b.processCount, 0, 100000, 0) : null;
    const connectionCount = b.connectionCount ? clampNum(b.connectionCount, 0, 100000, 0) : null;
    const httpConnectionCount = b.httpConnectionCount ? clampNum(b.httpConnectionCount, 0, 100000, 0) : null;
    const nginx = b.nginx && typeof b.nginx === "object" ? b.nginx : null;
    const varnish = b.varnish && typeof b.varnish === "object" ? b.varnish : null;
    const elasticsearch = b.elasticsearch && typeof b.elasticsearch === "object" ? b.elasticsearch : null;
    const sslExpiry = Array.isArray(b.sslExpiry) ? b.sslExpiry : null;
    const rawLogSnapshot = b.logSnapshot && typeof b.logSnapshot === "object" ? b.logSnapshot : null;
    const serializedLogSnapshot = rawLogSnapshot ? JSON.stringify(rawLogSnapshot) : "";
    const logSnapshot = rawLogSnapshot && serializedLogSnapshot.length <= 100_000 ? rawLogSnapshot : null;

    await db.insert(serverMetricsTable).values({
      serverId: server.id,
      cpuPercent,
      memUsedBytes,
      memTotalBytes,
      diskUsedBytes,
      diskTotalBytes,
      netRxBytes,
      netTxBytes,
      loadAvg1m,
      loadAvg5m,
      loadAvg15m,
      processCount,
      connectionCount,
      httpConnectionCount,
      topProcesses,
      phpFpm,
      mysql,
      nginx,
      varnish,
      elasticsearch,
      sslExpiry,
    });

    await db
      .update(serversTable)
      .set({ lastSeenAt: new Date() })
      .where(eq(serversTable.id, server.id));

    if (logSnapshot) {
      await db.insert(serverLogSnapshotsTable).values({
        serverId: server.id,
        logs: logSnapshot,
      });
      await db.delete(serverLogSnapshotsTable).where(and(
        eq(serverLogSnapshotsTable.serverId, server.id),
        lt(serverLogSnapshotsTable.recordedAt, new Date(Date.now() - 24 * 60 * 60 * 1000)),
      ));
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default serversRouter;
