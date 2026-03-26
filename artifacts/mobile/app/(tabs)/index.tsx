import React from "react";
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
import { useListSites, useTriggerCheck } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import Colors from "@/constants/colors";
import { StatusBadge } from "@/components/StatusBadge";

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const isWeb = Platform.OS === "web";
  const { data: sites, isLoading, refetch, isRefetching } = useListSites();
  const triggerCheck = useTriggerCheck();

  const handleManualCheck = async (siteId: number) => {
    try {
      await triggerCheck.mutateAsync({ siteId });
      queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
    } catch {}
  };

  const allUp = sites?.every((s) => s.currentStatus === "up");
  const anyDown = sites?.some((s) => s.currentStatus === "down");

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
        <View style={styles.header}>
          <Text style={styles.title}>Site Monitor</Text>
          <Text style={styles.subtitle}>
            {isLoading ? "Loading..." : `${sites?.length ?? 0} sites monitored`}
          </Text>
        </View>

        <View
          style={[
            styles.overviewCard,
            {
              backgroundColor: anyDown
                ? Colors.light.dangerBg
                : allUp
                  ? Colors.light.successBg
                  : Colors.light.warningBg,
            },
          ]}
        >
          <Feather
            name={anyDown ? "alert-circle" : allUp ? "check-circle" : "alert-triangle"}
            size={28}
            color={anyDown ? Colors.light.danger : allUp ? Colors.light.success : Colors.light.warning}
          />
          <View style={styles.overviewText}>
            <Text
              style={[
                styles.overviewTitle,
                {
                  color: anyDown ? Colors.light.danger : allUp ? Colors.light.success : Colors.light.warning,
                },
              ]}
            >
              {isLoading
                ? "Checking..."
                : anyDown
                  ? "Issues Detected"
                  : allUp
                    ? "All Systems Operational"
                    : "Performance Warning"}
            </Text>
            <Text style={styles.overviewSubtitle}>
              {isLoading ? "" : anyDown ? "One or more sites are down" : allUp ? "All sites responding normally" : "Some sites responding slowly"}
            </Text>
          </View>
        </View>

        {isLoading ? (
          <ActivityIndicator size="large" color={Colors.light.tint} style={{ marginTop: 40 }} />
        ) : (
          sites?.map((site) => (
            <View key={site.id} style={styles.siteCard}>
              <View style={styles.siteHeader}>
                <View style={styles.siteInfo}>
                  <Text style={styles.siteName}>{site.name}</Text>
                  <Text style={styles.siteUrl} numberOfLines={1}>
                    {site.url}
                  </Text>
                </View>
                <StatusBadge status={site.currentStatus as "up" | "down" | "slow" | "unknown"} size="large" />
              </View>

              <View style={styles.siteStats}>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>Response</Text>
                  <Text
                    style={[
                      styles.statValue,
                      {
                        color:
                          site.lastResponseTimeMs != null && site.lastResponseTimeMs > site.slowThresholdMs
                            ? Colors.light.warning
                            : Colors.light.text,
                      },
                    ]}
                  >
                    {site.lastResponseTimeMs != null ? `${site.lastResponseTimeMs}ms` : "--"}
                  </Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>Threshold</Text>
                  <Text style={styles.statValue}>{site.slowThresholdMs}ms</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>Last Check</Text>
                  <Text style={styles.statValue}>
                    {site.lastCheckedAt
                      ? new Date(site.lastCheckedAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "Never"}
                  </Text>
                </View>
              </View>

              <Pressable
                style={({ pressed }) => [styles.checkButton, pressed && styles.checkButtonPressed]}
                onPress={() => handleManualCheck(site.id)}
                disabled={triggerCheck.isPending}
                testID={`check-site-${site.id}`}
              >
                {triggerCheck.isPending ? (
                  <ActivityIndicator size="small" color={Colors.light.tint} />
                ) : (
                  <>
                    <Feather name="refresh-cw" size={14} color={Colors.light.tint} />
                    <Text style={styles.checkButtonText}>Check Now</Text>
                  </>
                )}
              </Pressable>
            </View>
          ))
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
  header: {
    marginBottom: 20,
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
  overviewCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    marginBottom: 20,
    gap: 12,
  },
  overviewText: {
    flex: 1,
  },
  overviewTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  overviewSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  siteCard: {
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
  siteHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  siteInfo: {
    flex: 1,
    marginRight: 12,
  },
  siteName: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
  },
  siteUrl: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  siteStats: {
    flexDirection: "row",
    backgroundColor: Colors.light.background,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  stat: {
    flex: 1,
    alignItems: "center",
  },
  statLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    backgroundColor: Colors.light.border,
    marginVertical: 2,
  },
  checkButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: `${Colors.light.tint}10`,
    gap: 6,
  },
  checkButtonPressed: {
    opacity: 0.7,
  },
  checkButtonText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.tint,
  },
});
