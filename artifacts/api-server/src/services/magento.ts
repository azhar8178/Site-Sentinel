import { db } from "@workspace/db";
import { magentoOrdersTable, magentoCartsTable, magentoSyncLogTable } from "@workspace/db/schema";
import { eq, desc, gte, and, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const MAGENTO_API_URL = process.env.MAGENTO_API_URL || "";
const MAGENTO_API_TOKEN = process.env.MAGENTO_API_TOKEN || "";
const SYNC_INTERVAL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 90_000;

async function magentoFetch(endpoint: string): Promise<any> {
  if (!MAGENTO_API_URL || !MAGENTO_API_TOKEN) {
    throw new Error("Magento API URL or token not configured");
  }

  const url = `${MAGENTO_API_URL}${endpoint}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${MAGENTO_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Magento API ${response.status}: ${text.substring(0, 200)}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function syncOrders(): Promise<number> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const sinceStr = since.toISOString().replace("T", " ").substring(0, 19);
  const PAGE_SIZE = 100;
  let currentPage = 1;
  let totalFetched = 0;

  while (true) {
    const params = new URLSearchParams({
      "searchCriteria[pageSize]": String(PAGE_SIZE),
      "searchCriteria[currentPage]": String(currentPage),
      "searchCriteria[sortOrders][0][field]": "entity_id",
      "searchCriteria[sortOrders][0][direction]": "DESC",
      "searchCriteria[filterGroups][0][filters][0][field]": "created_at",
      "searchCriteria[filterGroups][0][filters][0][value]": sinceStr,
      "searchCriteria[filterGroups][0][filters][0][conditionType]": "gteq",
      "fields": "items[entity_id,increment_id,status,grand_total,order_currency_code,customer_email,customer_firstname,customer_lastname,total_item_count,store_id,created_at],total_count",
    });

    const data = await magentoFetch(`/orders?${params.toString()}`);
    const items = data.items || [];

    for (const order of items) {
      const values = {
        orderId: order.entity_id,
        incrementId: order.increment_id || String(order.entity_id),
        status: order.status || "unknown",
        grandTotal: parseFloat(order.grand_total) || 0,
        currency: order.order_currency_code || "EUR",
        customerEmail: order.customer_email || null,
        customerFirstname: order.customer_firstname || null,
        customerLastname: order.customer_lastname || null,
        itemsCount: order.total_item_count || 0,
        storeId: order.store_id || 0,
        orderCreatedAt: new Date(order.created_at),
        syncedAt: new Date(),
      };

      await db
        .insert(magentoOrdersTable)
        .values(values)
        .onConflictDoUpdate({
          target: magentoOrdersTable.orderId,
          set: {
            status: values.status,
            grandTotal: values.grandTotal,
            syncedAt: values.syncedAt,
          },
        });
    }

    totalFetched += items.length;

    if (items.length < PAGE_SIZE || totalFetched >= (data.total_count || 0)) {
      break;
    }
    currentPage++;
  }

  return totalFetched;
}

async function syncCarts(): Promise<number> {
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const sinceStr = since.toISOString().replace("T", " ").substring(0, 19);
  const PAGE_SIZE = 100;
  let currentPage = 1;
  let totalFetched = 0;

  while (true) {
    const params = new URLSearchParams({
      "searchCriteria[pageSize]": String(PAGE_SIZE),
      "searchCriteria[currentPage]": String(currentPage),
      "searchCriteria[sortOrders][0][field]": "entity_id",
      "searchCriteria[sortOrders][0][direction]": "DESC",
      "searchCriteria[filterGroups][0][filters][0][field]": "updated_at",
      "searchCriteria[filterGroups][0][filters][0][value]": sinceStr,
      "searchCriteria[filterGroups][0][filters][0][conditionType]": "gteq",
      "searchCriteria[filterGroups][1][filters][0][field]": "items_count",
      "searchCriteria[filterGroups][1][filters][0][value]": "0",
      "searchCriteria[filterGroups][1][filters][0][conditionType]": "gt",
    });

    const data = await magentoFetch(`/carts/search?${params.toString()}`);
    const items = data.items || [];

    for (const cart of items) {
      const values = {
        quoteId: cart.id,
        customerEmail: cart.customer?.email || null,
        customerFirstname: cart.customer?.firstname || null,
        customerLastname: cart.customer?.lastname || null,
        isActive: cart.is_active ?? true,
        itemsCount: cart.items_count || 0,
        grandTotal: parseFloat(cart.grand_total) || 0,
        currency: cart.currency?.quote_currency_code || "EUR",
        storeId: cart.store_id || 0,
        cartCreatedAt: new Date(cart.created_at),
        cartUpdatedAt: new Date(cart.updated_at),
        syncedAt: new Date(),
      };

      await db
        .insert(magentoCartsTable)
        .values(values)
        .onConflictDoUpdate({
          target: magentoCartsTable.quoteId,
          set: {
            isActive: values.isActive,
            itemsCount: values.itemsCount,
            grandTotal: values.grandTotal,
            cartUpdatedAt: values.cartUpdatedAt,
            syncedAt: values.syncedAt,
          },
        });
    }

    totalFetched += items.length;

    if (items.length < PAGE_SIZE || totalFetched >= (data.total_count || 0)) {
      break;
    }
    currentPage++;
  }

  return totalFetched;
}

async function runSync(syncType: string, syncFn: () => Promise<number>): Promise<void> {
  const start = Date.now();
  try {
    const count = await syncFn();
    const duration = Date.now() - start;
    logger.info({ syncType, count, duration }, "Magento sync complete");

    await db.insert(magentoSyncLogTable).values({
      syncType,
      status: "success",
      recordsFetched: count,
      durationMs: duration,
    });
  } catch (err: any) {
    const duration = Date.now() - start;
    const errorMsg = err.message || String(err);
    logger.error({ syncType, error: errorMsg, duration }, "Magento sync failed");

    await db.insert(magentoSyncLogTable).values({
      syncType,
      status: "error",
      recordsFetched: 0,
      durationMs: duration,
      error: errorMsg.substring(0, 500),
    });
  }
}

async function runAllSyncs(): Promise<void> {
  await runSync("orders", syncOrders);
  await runSync("carts", syncCarts);
}

let syncInterval: ReturnType<typeof setInterval> | null = null;
let syncRunning = false;

async function guardedRunAllSyncs(): Promise<void> {
  if (syncRunning) {
    logger.warn("Magento sync already in progress, skipping");
    return;
  }
  syncRunning = true;
  try {
    await runAllSyncs();
  } finally {
    syncRunning = false;
  }
}

export function startMagentoSync(): void {
  if (!MAGENTO_API_URL || !MAGENTO_API_TOKEN) {
    logger.warn("Magento API not configured, skipping sync");
    return;
  }

  logger.info({ intervalMs: SYNC_INTERVAL_MS }, "Starting Magento sync");

  setTimeout(() => {
    guardedRunAllSyncs();
  }, 5000);

  syncInterval = setInterval(guardedRunAllSyncs, SYNC_INTERVAL_MS);
}

export function stopMagentoSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

export async function getOrderStats() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);

  const [todayOrders] = await db
    .select({
      count: sql<number>`count(*)::int`,
      revenue: sql<number>`coalesce(sum(${magentoOrdersTable.grandTotal}), 0)`,
    })
    .from(magentoOrdersTable)
    .where(gte(magentoOrdersTable.orderCreatedAt, todayStart));

  const [weekOrders] = await db
    .select({
      count: sql<number>`count(*)::int`,
      revenue: sql<number>`coalesce(sum(${magentoOrdersTable.grandTotal}), 0)`,
    })
    .from(magentoOrdersTable)
    .where(gte(magentoOrdersTable.orderCreatedAt, weekStart));

  const [activeCarts] = await db
    .select({
      count: sql<number>`count(*)::int`,
      totalValue: sql<number>`coalesce(sum(${magentoCartsTable.grandTotal}), 0)`,
    })
    .from(magentoCartsTable)
    .where(
      and(
        eq(magentoCartsTable.isActive, true),
        gte(magentoCartsTable.cartUpdatedAt, weekStart)
      )
    );

  const abandonedThreshold = new Date(Date.now() - 60 * 60 * 1000);
  const [abandonedCarts] = await db
    .select({
      count: sql<number>`count(*)::int`,
      totalValue: sql<number>`coalesce(sum(${magentoCartsTable.grandTotal}), 0)`,
    })
    .from(magentoCartsTable)
    .where(
      and(
        eq(magentoCartsTable.isActive, true),
        gte(magentoCartsTable.cartCreatedAt, weekStart),
        sql`${magentoCartsTable.cartUpdatedAt} < ${abandonedThreshold}`
      )
    );

  const totalCartsWeek = (activeCarts?.count || 0) + (weekOrders?.count || 0);
  const abandonmentRate = totalCartsWeek > 0
    ? Math.round(((abandonedCarts?.count || 0) / totalCartsWeek) * 100)
    : 0;

  return {
    today: {
      orders: todayOrders?.count || 0,
      revenue: Math.round((todayOrders?.revenue || 0) * 100) / 100,
    },
    week: {
      orders: weekOrders?.count || 0,
      revenue: Math.round((weekOrders?.revenue || 0) * 100) / 100,
    },
    carts: {
      active: activeCarts?.count || 0,
      activeValue: Math.round((activeCarts?.totalValue || 0) * 100) / 100,
      abandoned: abandonedCarts?.count || 0,
      abandonedValue: Math.round((abandonedCarts?.totalValue || 0) * 100) / 100,
      abandonmentRate,
    },
  };
}

export async function getRecentOrders(limit = 20) {
  return db
    .select()
    .from(magentoOrdersTable)
    .orderBy(desc(magentoOrdersTable.orderCreatedAt))
    .limit(limit);
}

export async function getAbandonedCarts(limit = 20) {
  const abandonedThreshold = new Date(Date.now() - 60 * 60 * 1000);

  return db
    .select()
    .from(magentoCartsTable)
    .where(
      and(
        eq(magentoCartsTable.isActive, true),
        sql`${magentoCartsTable.cartUpdatedAt} < ${abandonedThreshold}`,
        sql`${magentoCartsTable.itemsCount} > 0`
      )
    )
    .orderBy(desc(magentoCartsTable.grandTotal))
    .limit(limit);
}

export async function getLastSyncStatus() {
  const logs = await db
    .select()
    .from(magentoSyncLogTable)
    .orderBy(desc(magentoSyncLogTable.syncedAt))
    .limit(5);

  return logs;
}
