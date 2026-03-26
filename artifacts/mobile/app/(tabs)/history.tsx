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
import { useListSites, useGetCheckHistory } from "@workspace/api-client-react";

import Colors from "@/constants/colors";
import { SimpleChart } from "@/components/SimpleChart";

const TIME_RANGES = [
  { label: "1h", hours: 1 },
  { label: "6h", hours: 6 },
  { label: "24h", hours: 24 },
];

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);
  const [selectedRange, setSelectedRange] = useState(24);

  const { data: sites, isLoading: sitesLoading } = useListSites();
  const activeSiteId = selectedSiteId ?? sites?.[0]?.id;

  const { data: checkHistory, isLoading: historyLoading, refetch, isRefetching } = useGetCheckHistory(
    activeSiteId?.toString() ?? "0",
    { hours: selectedRange, limit: 500 },
    { query: { enabled: !!activeSiteId } }
  );

  const chartData = (checkHistory?.checks ?? [])
    .slice()
    .reverse()
    .map((c) => ({
      value: c.responseTimeMs ?? 0,
      isUp: c.isUp,
      label: new Date(c.checkedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    }));

  const avgResponseTime =
    chartData.length > 0
      ? Math.round(chartData.reduce((sum, d) => sum + d.value, 0) / chartData.length)
      : 0;

  const uptimePercent =
    chartData.length > 0
      ? ((chartData.filter((d) => d.isUp).length / chartData.length) * 100).toFixed(1)
      : "0.0";

  const maxResponseTime = chartData.length > 0 ? Math.max(...chartData.map((d) => d.value)) : 0;

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: (isWeb ? 67 : insets.top) + 16, paddingBottom: (isWeb ? 34 : insets.bottom) + 100 },
        ]}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.light.tint} />
        }
      >
        <Text style={styles.title}>History</Text>

        {sitesLoading ? (
          <ActivityIndicator size="large" color={Colors.light.tint} style={{ marginTop: 40 }} />
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.siteTabs}>
              {sites?.map((site) => (
                <Pressable
                  key={site.id}
                  style={[styles.siteTab, activeSiteId === site.id && styles.siteTabActive]}
                  onPress={() => setSelectedSiteId(site.id)}
                  testID={`site-tab-${site.id}`}
                >
                  <Text
                    style={[styles.siteTabText, activeSiteId === site.id && styles.siteTabTextActive]}
                  >
                    {site.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.rangeRow}>
              {TIME_RANGES.map((range) => (
                <Pressable
                  key={range.hours}
                  style={[styles.rangeButton, selectedRange === range.hours && styles.rangeButtonActive]}
                  onPress={() => setSelectedRange(range.hours)}
                >
                  <Text
                    style={[
                      styles.rangeButtonText,
                      selectedRange === range.hours && styles.rangeButtonTextActive,
                    ]}
                  >
                    {range.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>Response Time</Text>
              {historyLoading ? (
                <ActivityIndicator size="small" color={Colors.light.tint} style={{ marginVertical: 40 }} />
              ) : (
                <SimpleChart data={chartData} height={140} showLabels />
              )}
            </View>

            <View style={styles.statsRow}>
              <View style={styles.miniStat}>
                <Feather name="activity" size={16} color={Colors.light.tint} />
                <Text style={styles.miniStatLabel}>Avg Response</Text>
                <Text style={styles.miniStatValue}>{avgResponseTime}ms</Text>
              </View>
              <View style={styles.miniStat}>
                <Feather name="check-circle" size={16} color={Colors.light.success} />
                <Text style={styles.miniStatLabel}>Uptime</Text>
                <Text style={styles.miniStatValue}>{uptimePercent}%</Text>
              </View>
              <View style={styles.miniStat}>
                <Feather name="trending-up" size={16} color={Colors.light.warning} />
                <Text style={styles.miniStatLabel}>Peak</Text>
                <Text style={styles.miniStatValue}>{maxResponseTime}ms</Text>
              </View>
            </View>

            <View style={styles.recentSection}>
              <Text style={styles.sectionTitle}>Recent Checks</Text>
              {(checkHistory?.checks ?? []).slice(0, 20).map((check, i) => (
                <View key={check.id ?? i} style={styles.checkRow}>
                  <View style={styles.checkLeft}>
                    <View
                      style={[styles.checkDot, { backgroundColor: check.isUp ? Colors.light.success : Colors.light.danger }]}
                    />
                    <Text style={styles.checkTime}>
                      {new Date(check.checkedAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </Text>
                  </View>
                  <View style={styles.checkRight}>
                    {check.responseTimeMs != null && (
                      <Text style={styles.checkResponseTime}>{check.responseTimeMs}ms</Text>
                    )}
                    <Text style={[styles.checkStatus, { color: check.isUp ? Colors.light.success : Colors.light.danger }]}>
                      {check.isUp ? `${check.statusCode ?? 200}` : check.errorMessage?.substring(0, 20) ?? "Error"}
                    </Text>
                  </View>
                </View>
              ))}
              {(checkHistory?.checks ?? []).length === 0 && !historyLoading && (
                <View style={styles.emptyState}>
                  <Feather name="clock" size={32} color={Colors.light.textSecondary} />
                  <Text style={styles.emptyText}>No check data yet</Text>
                  <Text style={styles.emptySubtext}>Checks run every minute automatically</Text>
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
    marginBottom: 16,
  },
  siteTabs: {
    flexDirection: "row",
    marginBottom: 12,
    flexGrow: 0,
  },
  siteTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.light.surface,
    marginRight: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  siteTabActive: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  siteTabText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textSecondary,
  },
  siteTabTextActive: {
    color: "#FFFFFF",
  },
  rangeRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  rangeButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  rangeButtonActive: {
    backgroundColor: `${Colors.light.tint}15`,
    borderColor: Colors.light.tint,
  },
  rangeButtonText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textSecondary,
  },
  rangeButtonTextActive: {
    color: Colors.light.tint,
  },
  chartCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  chartTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 20,
  },
  miniStat: {
    flex: 1,
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    gap: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  miniStatLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textSecondary,
  },
  miniStatValue: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
  },
  recentSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    marginBottom: 12,
  },
  checkRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  checkLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  checkDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  checkTime: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.light.text,
  },
  checkRight: {
    alignItems: "flex-end",
    gap: 2,
  },
  checkResponseTime: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
  },
  checkStatus: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 8,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
  },
  emptySubtext: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
  },
});
