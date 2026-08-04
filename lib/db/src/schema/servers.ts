import { pgTable, serial, text, integer, boolean, timestamp, real, bigint, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { relations } from "drizzle-orm";

export const serversTable = pgTable("servers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  hostname: text("hostname").notNull(),
  apiKey: text("api_key").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  lastSeenAt: timestamp("last_seen_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const serversRelations = relations(serversTable, ({ many }) => ({
  metrics: many(serverMetricsTable),
}));

export const insertServerSchema = createInsertSchema(serversTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertServer = z.infer<typeof insertServerSchema>;
export type Server = typeof serversTable.$inferSelect;

export const serverMetricsTable = pgTable("server_metrics", {
  id: serial("id").primaryKey(),
  serverId: integer("server_id").notNull().references(() => serversTable.id, { onDelete: "cascade" }),
  cpuPercent: real("cpu_percent").notNull(),
  memUsedBytes: bigint("mem_used_bytes", { mode: "number" }).notNull(),
  memTotalBytes: bigint("mem_total_bytes", { mode: "number" }).notNull(),
  diskUsedBytes: bigint("disk_used_bytes", { mode: "number" }).notNull(),
  diskTotalBytes: bigint("disk_total_bytes", { mode: "number" }).notNull(),
  netRxBytes: bigint("net_rx_bytes", { mode: "number" }).notNull(),
  netTxBytes: bigint("net_tx_bytes", { mode: "number" }).notNull(),
  loadAvg1m: real("load_avg_1m").notNull(),
  loadAvg5m: real("load_avg_5m").notNull(),
  loadAvg15m: real("load_avg_15m").notNull(),
  processCount: integer("process_count"),
  connectionCount: integer("connection_count"),
  httpConnectionCount: integer("http_connection_count"),
  topProcesses: jsonb("top_processes"),
  phpFpm: jsonb("php_fpm"),
  mysql: jsonb("mysql_stats"),
  nginx: jsonb("nginx"),
  varnish: jsonb("varnish"),
  elasticsearch: jsonb("elasticsearch"),
  sslExpiry: jsonb("ssl_expiry"),
  waf: jsonb("waf"),
  recordedAt: timestamp("recorded_at").notNull().defaultNow(),
});

export const serverMetricsRelations = relations(serverMetricsTable, ({ one }) => ({
  server: one(serversTable, {
    fields: [serverMetricsTable.serverId],
    references: [serversTable.id],
  }),
}));

export const insertServerMetricSchema = createInsertSchema(serverMetricsTable).omit({ id: true });
export type InsertServerMetric = z.infer<typeof insertServerMetricSchema>;
export type ServerMetric = typeof serverMetricsTable.$inferSelect;

export const serverWafEventsTable = pgTable("server_waf_events", {
  id: serial("id").primaryKey(),
  serverId: integer("server_id").notNull().references(() => serversTable.id, { onDelete: "cascade" }),
  eventId: text("event_id").notNull(),
  action: text("action").notNull(),
  rule: text("rule"),
  ruleType: text("rule_type"),
  clientIp: text("client_ip"),
  country: text("country"),
  method: text("method"),
  uri: text("uri"),
  eventAt: timestamp("event_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  serverEventUnique: uniqueIndex("server_waf_events_server_event_unique").on(table.serverId, table.eventId),
}));

export const serverWafEventsRelations = relations(serverWafEventsTable, ({ one }) => ({
  server: one(serversTable, {
    fields: [serverWafEventsTable.serverId],
    references: [serversTable.id],
  }),
}));

export const insertServerWafEventSchema = createInsertSchema(serverWafEventsTable).omit({ id: true, createdAt: true });
export type InsertServerWafEvent = z.infer<typeof insertServerWafEventSchema>;
export type ServerWafEvent = typeof serverWafEventsTable.$inferSelect;

export const serverLogSnapshotsTable = pgTable("server_log_snapshots", {
  id: serial("id").primaryKey(),
  serverId: integer("server_id").notNull().references(() => serversTable.id, { onDelete: "cascade" }),
  logs: jsonb("logs").notNull(),
  recordedAt: timestamp("recorded_at").notNull().defaultNow(),
});

export const serverLogSnapshotsRelations = relations(serverLogSnapshotsTable, ({ one }) => ({
  server: one(serversTable, {
    fields: [serverLogSnapshotsTable.serverId],
    references: [serversTable.id],
  }),
}));

export const insertServerLogSnapshotSchema = createInsertSchema(serverLogSnapshotsTable).omit({ id: true });
export type InsertServerLogSnapshot = z.infer<typeof insertServerLogSnapshotSchema>;
export type ServerLogSnapshot = typeof serverLogSnapshotsTable.$inferSelect;
