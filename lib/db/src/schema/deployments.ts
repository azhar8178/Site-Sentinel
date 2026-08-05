import { pgEnum, pgTable, serial, text, integer, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const deploymentStatusEnum = pgEnum("deployment_status", [
  "running",
  "successful",
  "failed",
  "canceled",
  "unknown",
]);

export const deploymentSystemsTable = pgTable("deployment_systems", {
  id: serial("id").primaryKey(),
  systemKey: text("system_key").notNull().unique(),
  name: text("name").notNull(),
  provider: text("provider").notNull().default("gitlab"),
  projectPath: text("project_path"),
  defaultEnvironment: text("default_environment").notNull().default("production"),
  webhookSecretHash: text("webhook_secret_hash"),
  isActive: boolean("is_active").notNull().default(true),
  lastWebhookAt: timestamp("last_webhook_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertDeploymentSystemSchema = createInsertSchema(deploymentSystemsTable).omit({
  id: true,
  webhookSecretHash: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDeploymentSystem = z.infer<typeof insertDeploymentSystemSchema>;
export type DeploymentSystem = typeof deploymentSystemsTable.$inferSelect;

export const deploymentsTable = pgTable("deployments", {
  id: serial("id").primaryKey(),
  systemId: integer("system_id").notNull().references(() => deploymentSystemsTable.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("gitlab"),
  providerDeploymentId: text("provider_deployment_id").notNull(),
  environment: text("environment").notNull().default("production"),
  status: deploymentStatusEnum("status").notNull().default("unknown"),
  refName: text("ref_name"),
  commitSha: text("commit_sha"),
  releaseTag: text("release_tag"),
  summary: text("summary"),
  deployerName: text("deployer_name"),
  pipelineId: text("pipeline_id"),
  pipelineUrl: text("pipeline_url"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  durationMs: integer("duration_ms"),
  deployedAt: timestamp("deployed_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  providerDeploymentUnique: uniqueIndex("deployments_provider_deployment_unique")
    .on(table.provider, table.providerDeploymentId),
}));

export const insertDeploymentSchema = createInsertSchema(deploymentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDeployment = z.infer<typeof insertDeploymentSchema>;
export type Deployment = typeof deploymentsTable.$inferSelect;