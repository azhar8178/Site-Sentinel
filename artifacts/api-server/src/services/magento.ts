import { db } from "@workspace/db";
import { magentoOrdersTable, magentoCartsTable, magentoSyncLogTable, magentoConfigTable } from "@workspace/db/schema";
import { eq, desc, gte, and, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const ENV_MAGENTO_API_URL = process.env.MAGENTO_API_URL || "";
const ENV_MAGENTO_API_TOKEN = process.env.MAGENTO_API_TOKEN || "";
const ENV_MAGENTO_ADMIN_USER = process.env.MAGENTO_ADMIN_USER || "";
const ENV_MAGENTO_ADMIN_PASS = process.env.MAGENTO_ADMIN_PASS || "";
const SYNC_INTERVAL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 90_000;
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

let cachedToken: string | null = null;
let tokenExpiresAt: number = 0;

interface MagentoCredentials {
  apiUrl: string;
  adminUser: string;
  adminPass: string;
  apiToken: string;
}

async function getCredentials(): Promise<MagentoCredentials> {
  let dbConfig: { apiUrl?: string; adminUser?: string; adminPass?: string; apiToken?: string; isEnabled?: boolean } = {};
  try {
    const configs = await db.select().from(magentoConfigTable).limit(1);
    if (configs.length > 0 && configs[0].isEnabled) {
      dbConfig = {
        apiUrl: configs[0].apiUrl || undefined,
        adminUser: configs[0].adminUser || undefined,
        adminPass: configs[0].adminPass || undefined,
        apiToken: configs[0].apiToken || undefined,
        isEnabled: configs[0].isEnabled,
      };
    }
  } catch {}

  return {
    apiUrl: dbConfig.apiUrl || ENV_MAGENTO_API_URL,
    adminUser: dbConfig.adminUser || ENV_MAGENTO_ADMIN_USER,
    adminPass: dbConfig.adminPass || ENV_MAGENTO_ADMIN_PASS,
    apiToken: dbConfig.apiToken || ENV_MAGENTO_API_TOKEN,
  };
}

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt - TOKEN_REFRESH_BUFFER_MS) {
    return cachedToken;
  }

  const creds = await getCredentials();

  if (creds.apiToken) {
    logger.info({ tokenPrefix: creds.apiToken.substring(0, 8) + "..." }, "Using static Magento API token");
    cachedToken = creds.apiToken;
    tokenExpiresAt = Date.now() + 50 * 60 * 1000;
    return cachedToken;
  }

  if (creds.adminUser && creds.adminPass) {
    const baseUrl = creds.apiUrl.replace(/\/rest\/V[12]$/, "");
    const tokenUrl = `${baseUrl}/rest/V1/integration/admin/token`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: creds.adminUser, password: creds.adminPass }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        logger.warn({ status: response.status, body: text.substring(0, 200) }, "Failed to fetch admin token");
      } else {
        const token = (await response.json()) as string;
        cachedToken = token.replace(/^"|"$/g, "");
        tokenExpiresAt = Date.now() + 50 * 60 * 1000;
        logger.info("Fetched fresh Magento admin token");
        return cachedToken;
      }
    } catch (err: any) {
      logger.warn({ error: err.message }, "Admin token fetch failed");
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("No Magento authentication configured");
}

export function clearMagentoTokenCache() {
  cachedToken = null;
  tokenExpiresAt = 0;
  logger.info("Magento token cache cleared");
}

async function hasMagentoConfig(): Promise<boolean> {
  const creds = await getCredentials();
  return !!creds.apiUrl && !!(creds.apiToken || (creds.adminUser && creds.adminPass));
}

async function getMagentoApiUrl(): Promise<string> {
  const creds = await getCredentials();
  return creds.apiUrl;
}

async function magentoFetch(endpoint: string): Promise<any> {
  const token = await getToken();
  const apiUrl = await getMagentoApiUrl();

  const url = `${apiUrl}${endpoint}`;
  logger.debug({ url: url.substring(0, 120) }, "Magento API request");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });

    if (response.status === 401 && cachedToken) {
      cachedToken = null;
      tokenExpiresAt = 0;
      logger.warn("Token rejected (401), will refresh on next attempt");
    }

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

export async function startMagentoSync(): Promise<void> {
  const hasConfig = await hasMagentoConfig();
  if (!hasConfig) {
    logger.info("Magento API not configured yet. Sync will start when configured via Settings.");
  } else {
    logger.info({ intervalMs: SYNC_INTERVAL_MS }, "Starting Magento sync");
  }

  async function syncIfConfigured() {
    const ready = await hasMagentoConfig();
    if (ready) {
      await guardedRunAllSyncs();
    }
  }

  setTimeout(syncIfConfigured, 5000);
  syncInterval = setInterval(syncIfConfigured, SYNC_INTERVAL_MS);
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
