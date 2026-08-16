import { Router, type IRouter } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import { serversTable, serverMetricsTable, serverLogSnapshotsTable, serverWafEventsTable } from "@workspace/db/schema";
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

const META_SIGNAL_RE = /\b(?:facebook|meta(?:[ _-]?business)?|instagram|catalog|product[ _-]?feed|commerce manager|graphql)\b/i;
const META_ERROR_RE = /\b(?:error|critical|fatal|exception|failed|failure|rejected|invalid|denied|forbidden|timeout|unavailable|not found)\b/i;
const META_WARNING_RE = /\b(?:warn(?:ing)?|retry|delayed|pending|partial|throttl(?:e|ed|ing)|rate limit)\b/i;
const META_SUCCESS_RE = /\b(?:success(?:ful|fully)?|completed|processed|synced|uploaded|published|exported|created|updated|ready)\b/i;

type MetaStatus = "unknown" | "healthy" | "warning" | "error";

function getSnapshotSources(snapshot: typeof serverLogSnapshotsTable.$inferSelect): Record<string, string> {
  if (!snapshot.logs || typeof snapshot.logs !== "object") return {};
  const sources = (snapshot.logs as Record<string, unknown>).sources;
  if (!sources || typeof sources !== "object") return {};
  return Object.fromEntries(
    Object.entries(sources)
      .filter(([, value]) => typeof value === "string")
      .map(([source, value]) => [source, String(value)]),
  );
}

function extractMetaLines(snapshot: typeof serverLogSnapshotsTable.$inferSelect): string[] {
  const sources = getSnapshotSources(snapshot);
  const directMeta = (sources.meta || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (directMeta.length > 0) return directMeta;

  return Object.entries(sources)
    .filter(([source]) => source !== "stripe")
    .flatMap(([, value]) => value.split(/\r?\n/).map(line => line.trim()).filter(line => META_SIGNAL_RE.test(line)));
}

function summarizeMetaStatus(
  snapshots: typeof serverLogSnapshotsTable.$inferSelect[],
  hours: number,
) {
  const events: Array<{ line: string; recordedAt: string }> = [];
  for (const snapshot of snapshots) {
    for (const line of extractMetaLines(snapshot)) {
      events.push({ line: line.slice(0, 500), recordedAt: snapshot.recordedAt.toISOString() });
    }
  }

  const errorEvents = events.filter(event => META_ERROR_RE.test(event.line));
  const warningEvents = events.filter(event => META_WARNING_RE.test(event.line));
  const successEvents = events.filter(event => META_SUCCESS_RE.test(event.line));
  const status: MetaStatus = events.length === 0
    ? "unknown"
    : errorEvents.length > 0
      ? "error"
      : warningEvents.length > 0
        ? "warning"
        : successEvents.length > 0
          ? "healthy"
          : "warning";

  const message = status === "unknown"
    ? "No Meta or Facebook feed entries were found in the selected log window."
    : status === "error"
      ? "Meta or Facebook feed errors were found in the selected log window."
      : status === "warning"
        ? "Meta or Facebook feed activity needs review."
        : "Recent Meta or Facebook feed activity completed without detected errors.";

  return {
    status,
    source: "agent-log",
    hours,
    snapshotCount: snapshots.length,
    matchingSnapshotCount: new Set(events.map(event => event.recordedAt)).size,
    errorCount: errorEvents.length,
    warningCount: warningEvents.length,
    successCount: successEvents.length,
    lastEventAt: events.length > 0 ? events[events.length - 1].recordedAt : null,
    recentErrors: errorEvents.slice(-8).reverse(),
    recentEvents: events.slice(-8).reverse(),
    message,
  };
}

function wrapPdfText(value: string, maxLength = 92): string[] {
  const words = value.replace(/[^\x20-\x7E]/g, "?").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (!line) {
      line = word;
    } else if (line.length + word.length + 1 <= maxLength) {
      line += ` ${word}`;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [""];
}

function escapePdfText(value: string): string {
  return value
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function createManagementPdf(
  server: { id: number; name: string; hostname: string },
  hours: number,
  snapshots: typeof serverLogSnapshotsTable.$inferSelect[],
): Buffer {
  const sourceCounts = new Map<string, number>();
  let totalEntries = 0;
  let errorCount = 0;
  let warningCount = 0;
  let paymentCount = 0;

  for (const snapshot of snapshots) {
    const sources = snapshot.logs && typeof snapshot.logs === "object"
      ? (snapshot.logs as Record<string, unknown>).sources
      : null;
    if (!sources || typeof sources !== "object") continue;

    for (const [source, value] of Object.entries(sources)) {
      const text = String(value || "");
      if (!text.trim()) continue;
      sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
      const entries = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      totalEntries += entries.length;
      errorCount += (text.match(/\b(?:error|critical|fatal|alert|emerg|panic)\b/gi) || []).length;
      warningCount += (text.match(/\b(?:warn(?:ing)?|degraded|timeout|failed)\b/gi) || []).length;
      paymentCount += (text.match(/\b(?:stripe|payment|checkout|charge|refund|webhook)\b/gi) || []).length;
    }
  }

  const status = snapshots.length === 0
    ? "NO DATA"
    : errorCount > 0
      ? "REQUIRES ATTENTION"
      : warningCount > 0
        ? "MONITOR"
        : "NO CRITICAL INDICATORS";
  const statusExplanation = snapshots.length === 0
    ? "No log snapshots were collected during the selected period. Confirm that the monitoring agent is reporting."
    : errorCount > 0
      ? "Error or critical indicators were found and should be reviewed by the technical team."
      : warningCount > 0
        ? "Warnings or degraded-service indicators were found. Review recurring items and confirm business impact."
        : "No error or warning indicators were detected in the collected sanitized logs.";
  const sortedSources = [...sourceCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([source, count]) => `${source === "stripe" ? "Stripe payments" : source === "meta" ? "Meta / Facebook feed" : source}: ${count} snapshot(s)`);
  const recommendation = snapshots.length === 0
    ? "Confirm the agent service is active and has successfully posted a report."
    : errorCount > 0
      ? "Review critical/error entries with engineering and correlate them with customer or order impact."
      : warningCount > 0
        ? "Review recurring warnings and confirm whether any customer-facing services were affected."
        : "Continue normal monitoring; retain the technical export if further investigation is needed.";

  const rawLines = [
    "Site Sentinel - Management Log Summary",
    `Server: ${server.name} (${server.hostname})`,
    `Server ID: ${server.id}`,
    `Reporting period: Last ${hours} hour(s)`,
    `Generated: ${new Date().toISOString()}`,
    "",
    "Executive status",
    `Status: ${status}`,
    statusExplanation,
    "",
    "Activity overview",
    `Snapshots collected: ${snapshots.length}`,
    `Log entries reviewed: ${totalEntries}`,
    `Error/critical indicators: ${errorCount}`,
    `Warning/degraded indicators: ${warningCount}`,
    `Payment-related indicators: ${paymentCount}`,
    "",
    "Sources with collected data",
    ...(sortedSources.length > 0 ? sortedSources.map((source) => `- ${source}`) : ["- None"]),
    "",
    "Recommended next action",
    recommendation,
    "",
    "Report note",
    "This management report contains summary counts only. Use the sanitized JSON or CSV export for technical investigation and event-level analysis.",
  ];

  const wrappedLines = rawLines.flatMap((line) => line ? wrapPdfText(line) : [""]);
  const linesPerPage = 50;
  const pages: string[][] = [];
  for (let index = 0; index < wrappedLines.length; index += linesPerPage) {
    pages.push(wrappedLines.slice(index, index + linesPerPage));
  }
  if (pages.length === 0) pages.push(["No report data available."]);

  const objects: Array<string | null> = [null];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pages.map((_, index) => `${4 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  pages.forEach((pageLines, pageIndex) => {
    const pageObjectId = 4 + pageIndex * 2;
    const contentObjectId = pageObjectId + 1;
    const commands = [
      "BT",
      "/F1 16 Tf",
      "42 790 Td",
      `(${escapePdfText(pageIndex === 0 ? pageLines[0] || "Site Sentinel" : "Site Sentinel - Management Log Summary")}) Tj`,
      "/F1 10 Tf",
      "0 -28 Td",
      ...pageLines.slice(pageIndex === 0 ? 1 : 0).flatMap((line) => [
        `(${escapePdfText(line)}) Tj`,
        "0 -14 Td",
      ]),
      "ET",
    ].join("\n");

    objects[pageObjectId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectId} 0 R >>`;
    objects[contentObjectId] = `<< /Length ${Buffer.byteLength(commands, "ascii")} >>\nstream\n${commands}\nendstream`;
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 1; index < objects.length; index++) {
    offsets[index] = Buffer.byteLength(pdf, "binary");
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "binary");
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "binary");
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

serversRouter.get("/servers/:id/meta-status", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid server ID" });
      return;
    }

    const [server] = await db
      .select({ id: serversTable.id })
      .from(serversTable)
      .where(eq(serversTable.id, id))
      .limit(1);
    if (!server) {
      res.status(404).json({ error: "Server not found" });
      return;
    }

    const hours = clampNum(req.query.hours, 1, 24, 6);
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const snapshots = await db
      .select()
      .from(serverLogSnapshotsTable)
      .where(and(eq(serverLogSnapshotsTable.serverId, id), gte(serverLogSnapshotsTable.recordedAt, since)))
      .orderBy(serverLogSnapshotsTable.recordedAt);

    res.json(summarizeMetaStatus(snapshots, hours));
  } catch (err) {
    next(err);
  }
});

serversRouter.get("/servers/:id/log-snapshots/export", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid server ID" });
      return;
    }

    const hours = clampNum(req.query.hours, 1, 24, 6);
    const format = String(req.query.format || "json").toLowerCase();
    if (format !== "json" && format !== "csv" && format !== "pdf") {
      res.status(400).json({ error: "format must be json, csv, or pdf" });
      return;
    }

    const [server] = await db
      .select({ id: serversTable.id, name: serversTable.name, hostname: serversTable.hostname })
      .from(serversTable)
      .where(eq(serversTable.id, id))
      .limit(1);
    if (!server) {
      res.status(404).json({ error: "Server not found" });
      return;
    }

    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const snapshots = await db
      .select()
      .from(serverLogSnapshotsTable)
      .where(and(eq(serverLogSnapshotsTable.serverId, id), gte(serverLogSnapshotsTable.recordedAt, since)))
      .orderBy(serverLogSnapshotsTable.recordedAt);

    const safeName = server.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `server-${id}`;
    const suffix = `${safeName}-logs-${hours}h`;
    res.setHeader("Content-Disposition", `attachment; filename="${suffix}.${format}"`);

    if (format === "pdf") {
      res.type("application/pdf").send(createManagementPdf(server, hours, snapshots));
      return;
    }

    if (format === "json") {
      res.type("application/json").send(JSON.stringify({
        exportedAt: new Date().toISOString(),
        server,
        hours,
        snapshots,
      }, null, 2));
      return;
    }

    const csvEscape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = [["snapshot_id", "recorded_at", "source", "logs"]];
    for (const snapshot of snapshots) {
      const sources = snapshot.logs && typeof snapshot.logs === "object"
        ? (snapshot.logs as Record<string, unknown>).sources
        : null;
      if (!sources || typeof sources !== "object") {
        rows.push([String(snapshot.id), snapshot.recordedAt.toISOString(), "snapshot", JSON.stringify(snapshot.logs)]);
        continue;
      }
      for (const [source, logs] of Object.entries(sources)) {
        if (logs) rows.push([String(snapshot.id), snapshot.recordedAt.toISOString(), source, String(logs)]);
      }
    }
    res.type("text/csv").send(rows.map((row) => row.map(csvEscape).join(",")).join("\n") + "\n");
  } catch (err) {
    next(err);
  }
});

serversRouter.get("/servers/:id/waf-events", async (req, res, next): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid server ID" });
      return;
    }

    const hours = Math.max(1, Math.min(168, Number(req.query.hours) || 24));
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const events = await db
      .select()
      .from(serverWafEventsTable)
      .where(and(eq(serverWafEventsTable.serverId, id), gte(serverWafEventsTable.eventAt, since)))
      .orderBy(desc(serverWafEventsTable.eventAt))
      .limit(limit);

    res.json(events);
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
    const rawWaf = b.waf && typeof b.waf === "object" ? b.waf : null;
    const waf = rawWaf
      ? Object.fromEntries(Object.entries(rawWaf).filter(([key]) => key !== "events"))
      : null;
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
      waf,
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

    const wafEvents = Array.isArray(b.wafEvents)
      ? b.wafEvents.slice(0, 200)
      : rawWaf && Array.isArray(rawWaf.events)
        ? rawWaf.events.slice(0, 200)
        : [];
    if (wafEvents.length > 0) {
      const parsedEvents = wafEvents
        .filter((event: any) => event && typeof event.eventId === "string" && typeof event.action === "string")
        .map((event: any) => ({
          serverId: server.id,
          eventId: event.eventId.slice(0, 128),
          action: event.action.slice(0, 32),
          rule: typeof event.rule === "string" ? event.rule.slice(0, 255) : null,
          ruleType: typeof event.ruleType === "string" ? event.ruleType.slice(0, 64) : null,
          clientIp: typeof event.clientIp === "string" ? event.clientIp.slice(0, 64) : null,
          country: typeof event.country === "string" ? event.country.slice(0, 16) : null,
          method: typeof event.method === "string" ? event.method.slice(0, 16) : null,
          uri: typeof event.uri === "string" ? event.uri.slice(0, 512) : null,
          eventAt: new Date(event.eventAt),
        }))
        .filter((event: any) => !Number.isNaN(event.eventAt.getTime()));

      if (parsedEvents.length > 0) {
        await db.insert(serverWafEventsTable)
          .values(parsedEvents)
          .onConflictDoNothing({ target: [serverWafEventsTable.serverId, serverWafEventsTable.eventId] });
      }
      await db.delete(serverWafEventsTable).where(and(
        eq(serverWafEventsTable.serverId, server.id),
        lt(serverWafEventsTable.eventAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
      ));
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default serversRouter;
