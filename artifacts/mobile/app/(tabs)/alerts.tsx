import React from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useListAlerts } from "@workspace/api-client-react";

import Colors from "@/constants/colors";

type AlertType = "downtime" | "slow_response" | "recovery";

const alertTypeConfig: Record<AlertType, { icon: keyof typeof Feather.glyphMap; color: string; bg: string; label: string }> = {
  downtime: { icon: "x-circle", color: Colors.light.danger, bg: Colors.light.dangerBg, label: "Downtime" },
  slow_response: { icon: "alert-triangle", color: Colors.light.warning, bg: Colors.light.warningBg, label: "Slow Response" },
  recovery: { icon: "check-circle", color: Colors.light.success, bg: Colors.light.successBg, label: "Recovery" },
};

export default function AlertsScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { data, isLoading, refetch, isRefetching } = useListAlerts({ limit: 100 });

  const alerts = data?.alerts ?? [];

  const renderAlert = ({ item }: { item: (typeof alerts)[0] }) => {
    const config = alertTypeConfig[(item.alertType as AlertType)] ?? alertTypeConfig.downtime;

    return (
      <View style={styles.alertCard}>
        <View style={[styles.alertIcon, { backgroundColor: config.bg }]}>
          <Feather name={config.icon} size={20} color={config.color} />
        </View>
        <View style={styles.alertContent}>
          <View style={styles.alertHeader}>
            <Text style={[styles.alertType, { color: config.color }]}>{config.label}</Text>
            {item.emailSent && (
              <View style={styles.emailBadge}>
                <Feather name="mail" size={10} color={Colors.light.textSecondary} />
              </View>
            )}
          </View>
          <Text style={styles.alertSite}>{item.siteName}</Text>
          <Text style={styles.alertMessage} numberOfLines={2}>
            {item.message}
          </Text>
          <View style={styles.alertMeta}>
            <Text style={styles.alertTime}>
              {new Date(item.createdAt).toLocaleDateString([], {
                month: "short",
                day: "numeric",
              })}{" "}
              {new Date(item.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
            {item.responseTimeMs != null && (
              <Text style={styles.alertResponseTime}>{item.responseTimeMs}ms</Text>
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <View style={[styles.headerSection, { paddingTop: (isWeb ? 67 : insets.top) + 16 }]}>
        <Text style={styles.title}>Alerts</Text>
        <Text style={styles.subtitle}>
          {isLoading ? "Loading..." : `${data?.total ?? 0} total alerts`}
        </Text>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color={Colors.light.tint} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={alerts}
          renderItem={renderAlert}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={[styles.listContent, { paddingBottom: (isWeb ? 34 : insets.bottom) + 100 }]}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.light.tint} />
          }
          scrollEnabled={alerts.length > 0}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="bell-off" size={40} color={Colors.light.textSecondary} />
              <Text style={styles.emptyText}>No alerts yet</Text>
              <Text style={styles.emptySubtext}>
                Alerts will appear here when your sites go down or become slow
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  headerSection: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    marginTop: 4,
  },
  listContent: {
    paddingHorizontal: 20,
  },
  alertCard: {
    flexDirection: "row",
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  alertIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  alertContent: {
    flex: 1,
  },
  alertHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  alertType: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  emailBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.light.background,
    alignItems: "center",
    justifyContent: "center",
  },
  alertSite: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    marginTop: 2,
  },
  alertMessage: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
  alertMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
  },
  alertTime: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textSecondary,
  },
  alertResponseTime: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
    gap: 8,
  },
  emptyText: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
  },
  emptySubtext: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    textAlign: "center",
    paddingHorizontal: 40,
  },
});
