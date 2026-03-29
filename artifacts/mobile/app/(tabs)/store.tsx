import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  RefreshControl,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react/custom-fetch";

import Colors from "@/constants/colors";

interface StoreStats {
  storeId: number;
  name: string;
  currency: string;
  today: { orders: number; revenue: number };
  week: { orders: number; revenue: number };
  carts: { active: number; activeValue: number; abandoned: number; abandonedValue: number; abandonmentRate: number };
}

interface ByStoreResponse {
  stores: StoreStats[];
  combined: {
    today: { orders: number; revenue: number };
    week: { orders: number; revenue: number };
    carts: { active: number; activeValue: number; abandoned: number; abandonedValue: number; abandonmentRate: number };
  };
}

function formatCurrency(amount: number, currency = "EUR"): string {
  const symbol = currency === "GBP" ? "\u00a3" : "\u20ac";
  return `${symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function timeSince(dateStr: string | null | undefined): string {
  if (!dateStr) return "Never";
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function orderStatusColor(status: string): string {
  switch (status) {
    case "complete": return Colors.light.success;
    case "processing": return Colors.light.tint;
    case "pending": case "pending_payment": return Colors.light.warning;
    case "canceled": case "closed": case "fraud": return Colors.light.danger;
    default: return Colors.light.textSecondary;
  }
}

function StatCard({ title, value, subtitle, icon, color }: {
  title: string; value: string; subtitle?: string; icon: string; color: string;
}) {
  return (
    <View style={statStyles.card}>
      <View style={[statStyles.iconBg, { backgroundColor: color + "15" }]}>
        <Feather name={icon as any} size={20} color={color} />
      </View>
      <Text style={statStyles.value}>{value}</Text>
      <Text style={statStyles.title}>{title}</Text>
      {subtitle ? <Text style={statStyles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function StoreCard({ store, onPress }: { store: StoreStats; onPress: () => void }) {
  const cur = store.currency;
  return (
    <Pressable style={styles.storeSection} onPress={onPress}>
      <View style={styles.storeSectionHeader}>
        <View style={styles.storeSectionLeft}>
          <Text style={styles.storeSectionName}>{store.name}</Text>
          <View style={styles.currencyBadge}>
            <Text style={styles.currencyBadgeText}>{cur}</Text>
          </View>
        </View>
        <View style={styles.viewDetailsBtn}>
          <Text style={styles.viewDetailsText}>Details</Text>
          <Feather name="chevron-right" size={14} color={Colors.light.tint} />
        </View>
      </View>
      <View style={styles.statsGrid}>
        <StatCard
          title="Today"
          value={String(store.today.orders)}
          subtitle={formatCurrency(store.today.revenue, cur)}
          icon="shopping-bag"
          color={Colors.light.tint}
        />
        <StatCard
          title="This Week"
          value={String(store.week.orders)}
          subtitle={formatCurrency(store.week.revenue, cur)}
          icon="trending-up"
          color={Colors.light.success}
        />
      </View>
      <View style={styles.statsGrid}>
        <StatCard
          title="Active Carts"
          value={String(store.carts.active)}
          subtitle={formatCurrency(store.carts.activeValue, cur)}
          icon="shopping-cart"
          color={Colors.light.warning}
        />
        <StatCard
          title="Abandoned"
          value={String(store.carts.abandoned)}
          subtitle={`${store.carts.abandonmentRate}% rate`}
          icon="alert-triangle"
          color={Colors.light.danger}
        />
      </View>
    </Pressable>
  );
}

type TabType = "orders" | "carts";

export default function StoreScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const [activeStore, setActiveStore] = useState<number | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<TabType>("orders");

  const { data: storeData, isLoading: statsLoading, refetch: refetchStats, isRefetching } = useQuery<ByStoreResponse>({
    queryKey: ["/api/magento/stats/by-store"],
    queryFn: () => customFetch<ByStoreResponse>("/api/magento/stats/by-store"),
    refetchInterval: 60000,
    retry: 3,
    retryDelay: 1000,
  });

  const storeIdParam = activeStore !== undefined ? `&storeId=${activeStore}` : "";
  const { data: orders, isLoading: ordersLoading, refetch: refetchOrders } = useQuery<any[]>({
    queryKey: ["/api/magento/orders", activeStore],
    queryFn: () => customFetch<any[]>(`/api/magento/orders?limit=20${storeIdParam}`),
    refetchInterval: 60000,
    retry: 3,
    retryDelay: 1000,
  });

  const { data: carts, isLoading: cartsLoading, refetch: refetchCarts } = useQuery<any[]>({
    queryKey: ["/api/magento/carts", activeStore],
    queryFn: () => customFetch<any[]>(`/api/magento/carts?limit=20${storeIdParam}`),
    refetchInterval: 60000,
    retry: 3,
    retryDelay: 1000,
  });

  const { data: syncLogs, refetch: refetchSync } = useQuery<any[]>({
    queryKey: ["/api/magento/sync"],
    queryFn: () => customFetch<any[]>("/api/magento/sync"),
    refetchInterval: 60000,
    retry: 3,
    retryDelay: 1000,
  });

  const stores = storeData?.stores || [];
  const activeStoreInfo = stores.find(s => s.storeId === activeStore);
  const activeCurrency = activeStoreInfo?.currency || "EUR";

  const lastSync = syncLogs && syncLogs.length > 0 ? syncLogs[0] : null;
  const syncOk = lastSync?.status === "success";

  const handleRefresh = () => {
    refetchStats();
    refetchOrders();
    refetchCarts();
    refetchSync();
  };

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: (isWeb ? 67 : insets.top) + 16, paddingBottom: (isWeb ? 34 : insets.bottom) + 100 },
        ]}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} tintColor={Colors.light.tint} />
        }
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Stores</Text>
            <Text style={styles.subtitle}>IE & UK Performance</Text>
          </View>
          <View style={styles.syncBadge}>
            <View style={[styles.syncDot, { backgroundColor: syncOk ? Colors.light.success : Colors.light.warning }]} />
            <Text style={styles.syncText}>
              {lastSync ? timeSince(lastSync.syncedAt) : "No sync"}
            </Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.storeTabsScroll} contentContainerStyle={styles.storeTabsContainer}>
          <Pressable
            style={[styles.storeTab, activeStore === undefined && styles.storeTabActive]}
            onPress={() => setActiveStore(undefined)}
          >
            <Feather name="grid" size={14} color={activeStore === undefined ? "#fff" : Colors.light.textSecondary} />
            <Text style={[styles.storeTabText, activeStore === undefined && styles.storeTabTextActive]}>All Stores</Text>
          </Pressable>
          {stores.map(store => (
            <Pressable
              key={store.storeId}
              style={[styles.storeTab, activeStore === store.storeId && styles.storeTabActive]}
              onPress={() => setActiveStore(store.storeId)}
            >
              <View style={[styles.currencyDot, { backgroundColor: activeStore === store.storeId ? "rgba(255,255,255,0.4)" : Colors.light.border }]}>
                <Text style={[styles.currencyDotText, activeStore === store.storeId && { color: "#fff" }]}>{store.currency === "EUR" ? "\u20ac" : "\u00a3"}</Text>
              </View>
              <Text style={[styles.storeTabText, activeStore === store.storeId && styles.storeTabTextActive]}>
                {store.name.replace("Love Furniture ", "")}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {statsLoading ? (
          <ActivityIndicator size="large" color={Colors.light.tint} style={{ marginTop: 40 }} />
        ) : activeStore === undefined ? (
          stores.length > 0 ? (
            stores.map(store => (
              <StoreCard key={store.storeId} store={store} onPress={() => setActiveStore(store.storeId)} />
            ))
          ) : (
            <View style={styles.emptyState}>
              <Feather name="package" size={48} color={Colors.light.tabIconDefault} />
              <Text style={styles.emptyTitle}>No Data Yet</Text>
              <Text style={styles.emptyText}>
                Waiting for Magento sync to complete. Data will appear within 5 minutes.
              </Text>
            </View>
          )
        ) : activeStoreInfo ? (
          <>
            <View style={styles.statsGrid}>
              <StatCard
                title="Today's Orders"
                value={String(activeStoreInfo.today.orders)}
                subtitle={formatCurrency(activeStoreInfo.today.revenue, activeCurrency)}
                icon="shopping-bag"
                color={Colors.light.tint}
              />
              <StatCard
                title="This Week"
                value={String(activeStoreInfo.week.orders)}
                subtitle={formatCurrency(activeStoreInfo.week.revenue, activeCurrency)}
                icon="trending-up"
                color={Colors.light.success}
              />
            </View>
            <View style={styles.statsGrid}>
              <StatCard
                title="Active Carts"
                value={String(activeStoreInfo.carts.active)}
                subtitle={formatCurrency(activeStoreInfo.carts.activeValue, activeCurrency)}
                icon="shopping-cart"
                color={Colors.light.warning}
              />
              <StatCard
                title="Abandoned"
                value={`${activeStoreInfo.carts.abandoned}`}
                subtitle={`${activeStoreInfo.carts.abandonmentRate}% rate`}
                icon="alert-triangle"
                color={Colors.light.danger}
              />
            </View>

            <View style={styles.tabBar}>
              <Pressable
                style={[styles.tab, activeTab === "orders" && styles.tabActive]}
                onPress={() => setActiveTab("orders")}
              >
                <Text style={[styles.tabText, activeTab === "orders" && styles.tabTextActive]}>
                  Recent Orders
                </Text>
              </Pressable>
              <Pressable
                style={[styles.tab, activeTab === "carts" && styles.tabActive]}
                onPress={() => setActiveTab("carts")}
              >
                <Text style={[styles.tabText, activeTab === "carts" && styles.tabTextActive]}>
                  Abandoned Carts
                </Text>
              </Pressable>
            </View>

            {activeTab === "orders" && (
              ordersLoading ? (
                <ActivityIndicator size="small" color={Colors.light.tint} style={{ marginTop: 20 }} />
              ) : !orders || orders.length === 0 ? (
                <View style={styles.listEmpty}>
                  <Text style={styles.listEmptyText}>No recent orders for this store</Text>
                </View>
              ) : (
                orders.map((order: any) => (
                  <View key={order.id} style={styles.orderCard}>
                    <View style={styles.orderHeader}>
                      <View>
                        <Text style={styles.orderId}>#{order.incrementId}</Text>
                        <Text style={styles.orderCustomer}>
                          {order.customerFirstname && order.customerLastname
                            ? `${order.customerFirstname} ${order.customerLastname}`
                            : order.customerEmail || "Guest"}
                        </Text>
                      </View>
                      <View style={styles.orderRight}>
                        <Text style={styles.orderTotal}>
                          {formatCurrency(order.grandTotal, order.currency || activeCurrency)}
                        </Text>
                        <View style={[styles.statusBadge, { backgroundColor: orderStatusColor(order.status) + "20" }]}>
                          <Text style={[styles.statusText, { color: orderStatusColor(order.status) }]}>
                            {order.status}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View style={styles.orderFooter}>
                      <Text style={styles.orderMeta}>
                        <Feather name="package" size={11} color={Colors.light.textSecondary} />
                        {" "}{order.itemsCount} items
                      </Text>
                      <Text style={styles.orderMeta}>{timeSince(order.orderCreatedAt)}</Text>
                    </View>
                  </View>
                ))
              )
            )}

            {activeTab === "carts" && (
              cartsLoading ? (
                <ActivityIndicator size="small" color={Colors.light.tint} style={{ marginTop: 20 }} />
              ) : !carts || carts.length === 0 ? (
                <View style={styles.listEmpty}>
                  <Text style={styles.listEmptyText}>No abandoned carts for this store</Text>
                </View>
              ) : (
                carts.map((cart: any) => (
                  <View key={cart.id} style={styles.cartCard}>
                    <View style={styles.orderHeader}>
                      <View>
                        <Text style={styles.cartCustomer}>
                          {cart.customerFirstname && cart.customerLastname
                            ? `${cart.customerFirstname} ${cart.customerLastname}`
                            : cart.customerEmail || "Guest"}
                        </Text>
                        <Text style={styles.orderMeta}>{cart.itemsCount} items in cart</Text>
                      </View>
                      <View style={styles.orderRight}>
                        <Text style={[styles.orderTotal, { color: Colors.light.danger }]}>
                          {formatCurrency(cart.grandTotal, cart.currency || activeCurrency)}
                        </Text>
                        <Text style={styles.orderMeta}>Idle {timeSince(cart.cartUpdatedAt)}</Text>
                      </View>
                    </View>
                  </View>
                ))
              )
            )}
          </>
        ) : null}

        {lastSync?.status === "error" && (
          <View style={styles.syncError}>
            <Feather name="alert-circle" size={16} color={Colors.light.danger} />
            <Text style={styles.syncErrorText}>
              Last sync failed: {lastSync.error || "Unknown error"}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const statStyles = StyleSheet.create({
  card: { flex: 1, backgroundColor: Colors.light.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: Colors.light.border, alignItems: "flex-start" },
  iconBg: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  value: { fontSize: 22, fontFamily: "Inter_700Bold", color: Colors.light.text },
  title: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary, marginTop: 2 },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, marginTop: 2 },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.light.background },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", color: Colors.light.text },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, marginTop: 2 },
  syncBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.light.surface, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: Colors.light.border },
  syncDot: { width: 8, height: 8, borderRadius: 4 },
  syncText: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  storeTabsScroll: { marginBottom: 16 },
  storeTabsContainer: { gap: 8 },
  storeTab: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  storeTabActive: { backgroundColor: Colors.light.tint, borderColor: Colors.light.tint },
  storeTabText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.light.textSecondary },
  storeTabTextActive: { color: "#fff" },
  currencyDot: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  currencyDotText: { fontSize: 12, fontFamily: "Inter_700Bold", color: Colors.light.textSecondary },
  storeSection: { marginBottom: 20, backgroundColor: Colors.light.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: Colors.light.border },
  storeSectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  storeSectionLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  storeSectionName: { fontSize: 17, fontFamily: "Inter_700Bold", color: Colors.light.text },
  currencyBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: Colors.light.background, borderWidth: 1, borderColor: Colors.light.border },
  currencyBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: Colors.light.textSecondary },
  viewDetailsBtn: { flexDirection: "row", alignItems: "center", gap: 2 },
  viewDetailsText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.light.tint },
  statsGrid: { flexDirection: "row", gap: 12, marginBottom: 12 },
  tabBar: { flexDirection: "row", backgroundColor: Colors.light.surface, borderRadius: 12, padding: 4, marginBottom: 16, marginTop: 4, borderWidth: 1, borderColor: Colors.light.border },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 10 },
  tabActive: { backgroundColor: Colors.light.tint },
  tabText: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  tabTextActive: { color: "#fff" },
  orderCard: { backgroundColor: Colors.light.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.light.border },
  orderHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  orderId: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  orderCustomer: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, marginTop: 2 },
  orderRight: { alignItems: "flex-end" },
  orderTotal: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.light.text },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 4 },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" },
  orderFooter: { flexDirection: "row", justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.light.border },
  orderMeta: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary },
  cartCard: { backgroundColor: Colors.light.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.light.border, borderLeftWidth: 3, borderLeftColor: Colors.light.danger },
  cartCustomer: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  emptyState: { alignItems: "center", paddingTop: 60 },
  emptyTitle: { fontSize: 20, fontFamily: "Inter_600SemiBold", color: Colors.light.text, marginTop: 16 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, marginTop: 8, textAlign: "center", paddingHorizontal: 40, lineHeight: 20 },
  listEmpty: { alignItems: "center", paddingVertical: 30 },
  listEmptyText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.light.tabIconDefault },
  syncError: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.light.dangerBg, padding: 12, borderRadius: 10, marginTop: 16 },
  syncErrorText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.danger, flex: 1 },
});
