import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { db } from "@workspace/db";
import {
  deploymentSystemsTable,
  deploymentsTable,
} from "@workspace/db/schema";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { requireRole } from "../middleware/auth";

const router: IRouter = Router();

const STATUS_VALUES = new Set(["running", "successful", "failed", "canceled", "unknown"]);
const MAX_TEXT = 1000;

function parseId(value: string): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function cleanText(value: unknown, max = MAX_TEXT): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function hashSecret(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

function createSecret(): string {
  return `sswh_${crypto.randomBytes(32).toString("hex")}`;
}

function safeEqualSecret(provided: string, expectedHash: string | null): boolean {
  if (!expectedHash || !provided) return false;
  const providedHash = Buffer.from(hashSecret(provided), "hex");
  const storedHash = Buffer.from(expectedHash, "hex");
  return providedHash.length === storedHash.length && crypto.timingSafeEqual(providedHash, storedHash);
}

function normalizeStatus(value: unknown): "running" | "successful" | "failed" | "canceled" | "unknown" {
  const raw = String(value ?? "").toLowerCase();
  if (raw === "success" || raw === "succeeded" || raw === "deployed" || raw === "complete" || raw === "completed") return "successful";
  if (raw === "running" || raw === "pending" || raw === "created" || raw === "preparing" || raw === "waiting") return "running";
  if (raw === "failed" || raw === "failure" || raw === "error") return "failed";
  if (raw === "canceled" || raw === "cancelled" || raw === "skipped") return "canceled";
  return STATUS_VALUES.has(raw) ? raw as "unknown" : "unknown";
}

function firstObject(...values: unknown[]): Record<string, any> {
  return values.find((value) => value && typeof value === "object" && !Array.isArray(value)) as Record<string, any> ?? {};
}

function normalizeGitlabPayload(body: Record<string, any>, system: typeof deploymentSystemsTable.$inferSelect) {
  const attributes = firstObject(body.object_attributes);
  const deployment = firstObject(body.deployment, attributes.deployment, body.deployable);
  const pipeline = firstObject(
    body.pipeline,
    attributes.pipeline,
    body.object_kind === "pipeline" ? attributes : null,
    deployment.pipeline,
  );
  const project = firstObject(body.project);
  const pushCommit = Array.isArray(body.commits) ? firstObject(body.commits[0]) : {};
  const commit = firstObject(body.commit, deployment.commit, pipeline.commit, pushCommit);
  const user = firstObject(
    body.user,
    body.user_name || body.user_username ? { name: body.user_name, username: body.user_username } : null,
    deployment.user,
    { name: commit.author_name, email: commit.author_email },
  );
  const refName = cleanText(
    deployment.ref ?? pipeline.ref ?? body.ref ?? body.ref_name ?? attributes.ref ?? body.after,
    255,
  );
  const commitSha = cleanText(
    deployment.sha ?? deployment.commit?.id ?? pipeline.sha ?? commit.id ?? body.sha ?? body.checkout_sha ?? body.after,
    128,
  );
  const pipelineId = deployment.deployable_id ?? deployment.pipeline_id ?? pipeline.id ?? body.build_id ?? body.pipeline_id;
  const providerDeploymentId = String(
    deployment.id
      ?? body.deployment_id
      ?? body.build_id
      ?? pipeline.id
      ?? body.pipeline_id
      ?? `${body.event_name ?? "event"}:${commitSha ?? Date.now()}`,
  ).slice(0, 255);
  const rawStatus = deployment.status
    ?? deployment.state
    ?? deployment.deployable?.status
    ?? body.build_status
    ?? body.status
    ?? pipeline.status;
  const status = normalizeStatus(rawStatus);
  const startedAt = parseDate(
    deployment.created_at
      ?? deployment.started_at
      ?? deployment.deployable?.created_at
      ?? pipeline.created_at
      ?? body.build_started_at
      ?? body.commits?.[0]?.timestamp
      ?? attributes.created_at,
  );
  const completedAt = parseDate(
    deployment.finished_at
      ?? deployment.completed_at
      ?? deployment.deployable?.finished_at
      ?? pipeline.finished_at
      ?? body.build_finished_at
      ?? body.after_timestamp
      ?? attributes.finished_at,
  );
  const durationMs = startedAt && completedAt ? Math.max(0, completedAt.getTime() - startedAt.getTime()) : null;
  const environment = cleanText(
    deployment.environment?.name ?? deployment.environment ?? body.environment ?? body.environment_name ?? system.defaultEnvironment,
    128,
  ) ?? system.defaultEnvironment;
  const pipelineUrl = cleanText(
    deployment.deployable_url
      ?? deployment.web_url
      ?? deployment.deployable?.web_url
      ?? pipeline.web_url
      ?? body.build_url
      ?? body.pipeline_url
      ?? project.web_url,
    1000,
  );
  const changedFiles = [
    ...(Array.isArray(body.commits) ? body.commits : []),
    ...(Array.isArray(commit.added) || Array.isArray(commit.modified) || Array.isArray(commit.removed) ? [commit] : []),
  ].flatMap((item) => [
    ...(Array.isArray(item.added) ? item.added.map((path: unknown) => ({ path: String(path), status: "added" as const })) : []),
    ...(Array.isArray(item.modified) ? item.modified.map((path: unknown) => ({ path: String(path), status: "modified" as const })) : []),
    ...(Array.isArray(item.removed) ? item.removed.map((path: unknown) => ({ path: String(path), status: "removed" as const })) : []),
  ]).filter((file, index, files) => files.findIndex((candidate) => candidate.path === file.path && candidate.status === file.status) === index).slice(0, 500);
  const commitTitle = cleanText(commit.title ?? body.commit_title ?? attributes.commit_title, 500);
  const commitMessage = cleanText(commit.message ?? body.commit_message ?? attributes.commit_message ?? commitTitle, 4000);
  const commitAuthorName = cleanText(commit.author_name ?? commit.author?.name ?? user.name, 255);
  const commitAuthorEmail = cleanText(commit.author_email ?? commit.author?.email ?? user.email, 320);
  const projectUrl = cleanText(project.web_url ?? project.homepage ?? body.project_url, 1000);
  const commitUrl = cleanText(
    commit.web_url
      ?? (projectUrl && commitSha ? `${projectUrl}/-/commit/${commitSha}` : null),
    1200,
  );
  const triggerSource = cleanText(
    body.event_name
      ?? body.object_kind
      ?? deployment.trigger
      ?? attributes.source
      ?? (body.commits ? "push" : "deployment"),
    64,
  );
  const summary = cleanText(
    deployment.description ?? commitTitle ?? commitMessage ?? pipeline.name ?? body.build_name,
    MAX_TEXT,
  );
  const deployerName = cleanText(user.name ?? user.username ?? user.login ?? body.user_name ?? body.user_username, 255);
  const releaseTag = refName?.startsWith("v") || refName?.match(/^\d+\.\d+/) ? refName : cleanText(deployment.tag, 128);

  return {
    systemId: system.id,
    provider: "gitlab",
    providerDeploymentId,
    environment,
    status,
    refName,
    commitSha,
    releaseTag,
    summary,
    commitTitle,
    commitMessage,
    commitAuthorName,
    commitAuthorEmail,
    triggerSource,
    projectUrl,
    commitUrl,
    changedFiles,
    deployerName,
    pipelineId: pipelineId === undefined || pipelineId === null ? null : String(pipelineId).slice(0, 128),
    pipelineUrl,
    startedAt,
    completedAt,
    durationMs,
    deployedAt: completedAt ?? startedAt ?? new Date(),
    updatedAt: new Date(),
  };
}

function serializeSystem(system: typeof deploymentSystemsTable.$inferSelect) {
  const { webhookSecretHash: _secret, ...safeSystem } = system;
  return safeSystem;
}

function serializeDeployment(row: any) {
  return {
    ...row.deployment,
    systemKey: row.system.systemKey,
    systemName: row.system.name,
  };
}

router.get("/deployment-systems", async (_req, res, next) => {
  try {
    const systems = await db.select().from(deploymentSystemsTable).orderBy(asc(deploymentSystemsTable.name));
    res.json(systems.map(serializeSystem));
  } catch (err) {
    next(err);
  }
});

router.post("/deployment-systems", requireRole("editor", "admin"), async (req, res, next) => {
  try {
    const systemKey = cleanText(req.body?.systemKey, 80)?.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
    const name = cleanText(req.body?.name, 160);
    if (!systemKey || systemKey.length < 2 || !name || name.length < 2) {
      res.status(400).json({ error: "systemKey and name are required" });
      return;
    }

    const secret = createSecret();
    const inserted = await db.insert(deploymentSystemsTable).values({
      systemKey,
      name,
      provider: cleanText(req.body?.provider, 64) ?? "gitlab",
      projectPath: cleanText(req.body?.projectPath, 255),
      defaultEnvironment: cleanText(req.body?.defaultEnvironment, 128) ?? "production",
      webhookSecretHash: hashSecret(secret),
    }).returning();

    res.status(201).json({ ...serializeSystem(inserted[0]), webhookSecret: secret });
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: "A deployment system with that key already exists" });
      return;
    }
    next(err);
  }
});

router.post("/deployment-systems/:systemId/rotate-secret", requireRole("admin"), async (req, res, next) => {
  try {
    const systemId = parseId(String(req.params.systemId));
    if (!systemId) {
      res.status(400).json({ error: "Invalid system ID" });
      return;
    }
    const secret = createSecret();
    const updated = await db.update(deploymentSystemsTable)
      .set({ webhookSecretHash: hashSecret(secret), updatedAt: new Date() })
      .where(eq(deploymentSystemsTable.id, systemId))
      .returning();
    if (!updated[0]) {
      res.status(404).json({ error: "Deployment system not found" });
      return;
    }
    res.json({ webhookSecret: secret });
  } catch (err) {
    next(err);
  }
});

router.get("/deployments", async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const system = cleanText(req.query.system, 80);
    const environment = cleanText(req.query.environment, 128);
    const status = cleanText(req.query.status, 32);
    const branch = cleanText(req.query.branch, 255);
    const deployer = cleanText(req.query.deployer, 255);
    const search = cleanText(req.query.search, 255);
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);
    const filters = [];

    if (system) filters.push(eq(deploymentSystemsTable.systemKey, system));
    if (environment) filters.push(eq(deploymentsTable.environment, environment));
    if (status && STATUS_VALUES.has(status)) filters.push(eq(deploymentsTable.status, status as any));
    if (branch) filters.push(ilike(deploymentsTable.refName, `%${branch}%`));
    if (deployer) filters.push(ilike(deploymentsTable.deployerName, `%${deployer}%`));
    if (from) filters.push(gte(deploymentsTable.deployedAt, from));
    if (to) filters.push(lte(deploymentsTable.deployedAt, to));
    if (search) {
      filters.push(or(
        ilike(deploymentsTable.summary, `%${search}%`),
        ilike(deploymentsTable.commitSha, `%${search}%`),
        ilike(deploymentsTable.refName, `%${search}%`),
        ilike(deploymentSystemsTable.name, `%${search}%`),
      ));
    }
    const where = filters.length ? and(...filters) : undefined;
    const [rows, totalRows, summaryRows, lastProduction] = await Promise.all([
      db.select({ deployment: deploymentsTable, system: deploymentSystemsTable })
        .from(deploymentsTable)
        .innerJoin(deploymentSystemsTable, eq(deploymentsTable.systemId, deploymentSystemsTable.id))
        .where(where)
        .orderBy(desc(deploymentsTable.deployedAt))
        .limit(limit)
        .offset((page - 1) * limit),
      db.select({ total: count() })
        .from(deploymentsTable)
        .innerJoin(deploymentSystemsTable, eq(deploymentsTable.systemId, deploymentSystemsTable.id))
        .where(where),
      db.select({
        status: deploymentsTable.status,
        total: count(),
      })
        .from(deploymentsTable)
        .innerJoin(deploymentSystemsTable, eq(deploymentsTable.systemId, deploymentSystemsTable.id))
        .where(where)
        .groupBy(deploymentsTable.status),
      db.select({ deployedAt: deploymentsTable.deployedAt })
        .from(deploymentsTable)
        .where(eq(deploymentsTable.environment, "production"))
        .orderBy(desc(deploymentsTable.deployedAt))
        .limit(1),
    ]);
    const counts = Object.fromEntries(summaryRows.map((row) => [row.status, Number(row.total)]));
    res.json({
      items: rows.map(serializeDeployment),
      total: Number(totalRows[0]?.total ?? 0),
      page,
      limit,
      summary: {
        total: Object.values(counts).reduce((sum, value) => sum + value, 0),
        successful: counts.successful ?? 0,
        failed: counts.failed ?? 0,
        running: counts.running ?? 0,
        lastProductionAt: lastProduction[0]?.deployedAt ?? null,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/deployments/:deploymentId", async (req, res, next) => {
  try {
    const deploymentId = parseId(String(req.params.deploymentId));
    if (!deploymentId) {
      res.status(400).json({ error: "Invalid deployment ID" });
      return;
    }
    const rows = await db.select({ deployment: deploymentsTable, system: deploymentSystemsTable })
      .from(deploymentsTable)
      .innerJoin(deploymentSystemsTable, eq(deploymentsTable.systemId, deploymentSystemsTable.id))
      .where(eq(deploymentsTable.id, deploymentId))
      .limit(1);
    if (!rows[0]) {
      res.status(404).json({ error: "Deployment not found" });
      return;
    }
    res.json(serializeDeployment(rows[0]));
  } catch (err) {
    next(err);
  }
});

export const gitlabWebhookRouter: IRouter = Router();

gitlabWebhookRouter.post("/webhooks/gitlab/:systemKey", async (req, res, next) => {
  try {
    const systemKey = cleanText(req.params.systemKey, 80);
    const providedToken = typeof req.headers["x-gitlab-token"] === "string" ? req.headers["x-gitlab-token"] : "";
    if (!systemKey || !providedToken) {
      res.status(401).json({ error: "Invalid webhook token" });
      return;
    }
    const systems = await db.select().from(deploymentSystemsTable)
      .where(and(eq(deploymentSystemsTable.systemKey, systemKey), eq(deploymentSystemsTable.isActive, true)))
      .limit(1);
    const system = systems[0];
    if (!system || !safeEqualSecret(providedToken, system.webhookSecretHash)) {
      res.status(401).json({ error: "Invalid webhook token" });
      return;
    }
    const payload = req.body && typeof req.body === "object" ? req.body as Record<string, any> : {};
    const normalized = normalizeGitlabPayload(payload, system);
    const [deployment] = await db.insert(deploymentsTable)
      .values(normalized)
      .onConflictDoUpdate({
        target: [deploymentsTable.provider, deploymentsTable.providerDeploymentId],
        set: normalized,
      })
      .returning({ id: deploymentsTable.id, status: deploymentsTable.status });
    await db.update(deploymentSystemsTable)
      .set({ lastWebhookAt: new Date(), updatedAt: new Date() })
      .where(eq(deploymentSystemsTable.id, system.id));
    res.json({ success: true, deploymentId: deployment.id, status: deployment.status });
  } catch (err) {
    next(err);
  }
});

export default router;