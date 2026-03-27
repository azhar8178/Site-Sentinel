import { pgTable, serial, text, integer, boolean, timestamp, real, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const magentoOrdersTable = pgTable("magento_orders", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().unique(),
  incrementId: text("increment_id").notNull(),
  status: text("status").notNull(),
  grandTotal: real("grand_total").notNull(),
  currency: text("currency").notNull(),
  customerEmail: text("customer_email"),
  customerFirstname: text("customer_firstname"),
  customerLastname: text("customer_lastname"),
  itemsCount: integer("items_count").notNull().default(0),
  storeId: integer("store_id").notNull().default(0),
  orderCreatedAt: timestamp("order_created_at").notNull(),
  syncedAt: timestamp("synced_at").notNull().defaultNow(),
});

export const insertMagentoOrderSchema = createInsertSchema(magentoOrdersTable).omit({ id: true });
export type InsertMagentoOrder = z.infer<typeof insertMagentoOrderSchema>;
export type MagentoOrder = typeof magentoOrdersTable.$inferSelect;

export const magentoCartsTable = pgTable("magento_carts", {
  id: serial("id").primaryKey(),
  quoteId: integer("quote_id").notNull().unique(),
  customerEmail: text("customer_email"),
  customerFirstname: text("customer_firstname"),
  customerLastname: text("customer_lastname"),
  isActive: boolean("is_active").notNull().default(true),
  itemsCount: integer("items_count").notNull().default(0),
  grandTotal: real("grand_total").notNull().default(0),
  currency: text("currency").notNull().default("EUR"),
  storeId: integer("store_id").notNull().default(0),
  cartCreatedAt: timestamp("cart_created_at").notNull(),
  cartUpdatedAt: timestamp("cart_updated_at").notNull(),
  syncedAt: timestamp("synced_at").notNull().defaultNow(),
});

export const insertMagentoCartSchema = createInsertSchema(magentoCartsTable).omit({ id: true });
export type InsertMagentoCart = z.infer<typeof insertMagentoCartSchema>;
export type MagentoCart = typeof magentoCartsTable.$inferSelect;

export const magentoSyncLogTable = pgTable("magento_sync_log", {
  id: serial("id").primaryKey(),
  syncType: text("sync_type").notNull(),
  status: text("status").notNull(),
  recordsFetched: integer("records_fetched").notNull().default(0),
  durationMs: integer("duration_ms").notNull().default(0),
  error: text("error"),
  syncedAt: timestamp("synced_at").notNull().defaultNow(),
});

export const insertMagentoSyncLogSchema = createInsertSchema(magentoSyncLogTable).omit({ id: true });
export type InsertMagentoSyncLog = z.infer<typeof insertMagentoSyncLogSchema>;
export type MagentoSyncLog = typeof magentoSyncLogTable.$inferSelect;
