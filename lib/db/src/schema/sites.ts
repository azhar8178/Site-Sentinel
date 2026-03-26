import { pgTable, serial, text, integer, boolean, timestamp, real, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { relations } from "drizzle-orm";

export const siteStatusEnum = pgEnum("site_status", ["up", "down", "slow", "unknown"]);
export const alertTypeEnum = pgEnum("alert_type", ["downtime", "slow_response", "recovery"]);

export const sitesTable = pgTable("sites", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  currentStatus: siteStatusEnum("current_status").notNull().default("unknown"),
  lastCheckedAt: timestamp("last_checked_at"),
  lastResponseTimeMs: integer("last_response_time_ms"),
  slowThresholdMs: integer("slow_threshold_ms").notNull().default(5000),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const sitesRelations = relations(sitesTable, ({ many }) => ({
  checkResults: many(checkResultsTable),
  alerts: many(alertsTable),
}));

export const insertSiteSchema = createInsertSchema(sitesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSite = z.infer<typeof insertSiteSchema>;
export type Site = typeof sitesTable.$inferSelect;

export const checkResultsTable = pgTable("check_results", {
  id: serial("id").primaryKey(),
  siteId: integer("site_id").notNull().references(() => sitesTable.id, { onDelete: "cascade" }),
  statusCode: integer("status_code"),
  responseTimeMs: integer("response_time_ms"),
  isUp: boolean("is_up").notNull(),
  errorMessage: text("error_message"),
  checkedAt: timestamp("checked_at").notNull().defaultNow(),
});

export const checkResultsRelations = relations(checkResultsTable, ({ one }) => ({
  site: one(sitesTable, {
    fields: [checkResultsTable.siteId],
    references: [sitesTable.id],
  }),
}));

export const insertCheckResultSchema = createInsertSchema(checkResultsTable).omit({ id: true });
export type InsertCheckResult = z.infer<typeof insertCheckResultSchema>;
export type CheckResult = typeof checkResultsTable.$inferSelect;

export const alertsTable = pgTable("alerts", {
  id: serial("id").primaryKey(),
  siteId: integer("site_id").notNull().references(() => sitesTable.id, { onDelete: "cascade" }),
  alertType: alertTypeEnum("alert_type").notNull(),
  message: text("message").notNull(),
  responseTimeMs: integer("response_time_ms"),
  statusCode: integer("status_code"),
  emailSent: boolean("email_sent").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const alertsRelations = relations(alertsTable, ({ one }) => ({
  site: one(sitesTable, {
    fields: [alertsTable.siteId],
    references: [sitesTable.id],
  }),
}));

export const insertAlertSchema = createInsertSchema(alertsTable).omit({ id: true, createdAt: true });
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type Alert = typeof alertsTable.$inferSelect;

export const alertConfigTable = pgTable("alert_config", {
  id: serial("id").primaryKey(),
  recipientEmails: text("recipient_emails").notNull().default(""),
  senderEmail: text("sender_email").notNull().default(""),
  isEnabled: boolean("is_enabled").notNull().default(true),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAlertConfigSchema = createInsertSchema(alertConfigTable).omit({ id: true, updatedAt: true });
export type InsertAlertConfig = z.infer<typeof insertAlertConfigSchema>;
export type AlertConfig = typeof alertConfigTable.$inferSelect;
