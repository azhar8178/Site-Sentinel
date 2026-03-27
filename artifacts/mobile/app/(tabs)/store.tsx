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
import {
  useGetMagentoStats,
  useGetMagentoOrders,
  useGetMagentoCarts,
  useGetMagentoSyncStatus,
} from "@workspace/api-client-react";

import Colors from "@/constants/colors";

function formatCurrency(amount: number, currency = "EUR"): string {
  const symbol = currency === "GBP" ? "\u00a3" : "\u20ac";
  return `${symbol}${amount.toFixed(2)}`;
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

type TabType = "orders" | "carts";

export default function StoreScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const [activeTab, setActiveTab] = useState<TabType>("orders");

  const { data: stats, isLoading: statsLoading, refetch: refetchStats, isRefetching } = useGetMagentoStats({
    query: { refetchInterval: 60000, retry: 3, retryDelay: 1000 },
  });
  const { data: orders, isLoading: ordersLoading, refetch: refetchOrders } = useGetMagentoOrders({ limit: 20 }, {
    query: { refetchInterval: 60000, retry: 3, retryDelay: 1000 },
  });
  const { data: carts, isLoading: cartsLoading, refetch: refetchCarts } = useGetMagentoCarts({ limit: 20 }, {
    query: { refetchInterval: 60000, retry: 3, retryDelay: 1000 },
  });
  const { data: syncLogs, refetch: refetchSync } = useGetMagentoSyncStatus({
    query: { refetchInterval: 60000, retry: 3, retryDelay: 1000 },
  });

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
            <Text style={styles.title}>Store</Text>
            <Text style={styles.subtitle}>Magento Order & Cart Tracking</Text>
          </View>
          <View style={styles.syncBadge}>
            <View style={[styles.syncDot, { backgroundColor: syncOk ? Colors.light.success : Colors.light.warning }]} />
            <Text style={styles.syncText}>
              {lastSync ? timeSince(lastSync.syncedAt) : "No sync"}
            </Text>
          </View>
        </View>

        {statsLoading ? (
          <ActivityIndicator size="large" color={Colors.light.tint} style={{ marginTop: 40 }} />
        ) : stats ? (
          <>
            <View style={styles.statsGrid}>
              <StatCard
                title="Today's Orders"
                value={String(stats.today.orders)}
                subtitle={formatCurrency(stats.today.revenue)}
                icon="shopping-bag"
                color={Colors.light.tint}
              />
              <StatCard
                title="This Week"
                value={String(stats.week.orders)}
                subtitle={formatCurrency(stats.week.revenue)}
                icon="trending-up"
                color={Colors.light.success}
              />
            </View>
            <View style={styles.statsGrid}>
              <StatCard
                title="Active Carts"
                value={String(stats.carts.active)}
                subtitle={formatCurrency(stats.carts.activeValue)}
                icon="shopping-cart"
                color={Colors.light.warning}
              />
              <StatCard
                title="Abandoned"
                value={`${stats.carts.abandoned} (${stats.carts.abandonmentRate}%)`}
                subtitle={formatCurrency(stats.carts.abandonedValue) + " lost"}
                icon="alert-triangle"
                color={Colors.light.danger}
              />
            </View>
          </>
        ) : (
          <View style={styles.emptyState}>
            <Feather name="package" size={48} color={Colors.light.tabIconDefault} />
            <Text style={styles.emptyTitle}>No Data Yet</Text>
            <Text style={styles.emptyText}>
              Waiting for Magento sync to complete. Data will appear within 5 minutes.
            </Text>
          </View>
        )}

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
              <Text style={styles.listEmptyText}>No recent orders</Text>
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
                      {formatCurrency(order.grandTotal, order.currency)}
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
              <Text style={styles.listEmptyText}>No abandoned carts</Text>
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
                      {formatCurrency(cart.grandTotal, cart.currency)}
                    </Text>
                    <Text style={styles.orderMeta}>Idle {timeSince(cart.cartUpdatedAt)}</Text>
                  </View>
                </View>
              </View>
            ))
          )
        )}

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
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", color: Colors.light.text },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, marginTop: 2 },
  syncBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.light.surface, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: Colors.light.border },
  syncDot: { width: 8, height: 8, borderRadius: 4 },
  syncText: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  statsGrid: { flexDirection: "row", gap: 12, marginBottom: 12 },
  tabBar: { flexDirection: "row", backgroundColor: Colors.light.surface, borderRadius: 12, padding: 4, marginBottom: 16, marginTop: 8, borderWidth: 1, borderColor: Colors.light.border },
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
