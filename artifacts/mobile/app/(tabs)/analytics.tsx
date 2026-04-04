import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  RefreshControl,
  Pressable,
  ActivityIndicator,
  Platform,
  Linking,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react/custom-fetch";

import Colors from "@/constants/colors";

interface GAStatus {
  connected: boolean;
  email?: string;
  selectedPropertyId?: string;
  expiresAt?: string;
  configured: boolean;
}

interface GAProperty {
  id: string;
  name: string;
  displayName: string;
}

interface GAData {
  propertyId: string;
  activeUsers: number;
  sessions: number;
  newUsers: number;
  totalUsers: number;
  engagementRate: number;
  bounceRate: number;
  pageViews: number;
  avgSessionDurationSec: number;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function MetricCard({
  icon,
  label,
  value,
  sub,
  iconBg,
  iconColor,
}: {
  icon: string;
  label: string;
  value: string | number;
  sub?: string;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <View style={metricStyles.card}>
      <View style={[metricStyles.icon, { backgroundColor: iconBg }]}>
        <Feather name={icon as any} size={18} color={iconColor} />
      </View>
      <Text style={metricStyles.label}>{label}</Text>
      <Text style={metricStyles.value}>{value}</Text>
      {sub ? <Text style={metricStyles.sub}>{sub}</Text> : null}
    </View>
  );
}

const metricStyles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: 14,
    minWidth: "47%",
  },
  icon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  label: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary, marginBottom: 4 },
  value: { fontSize: 22, fontFamily: "Inter_700Bold", color: Colors.light.text },
  sub: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, marginTop: 2 },
});

function PropertyPicker({
  visible,
  properties,
  selectedId,
  onSelect,
  onClose,
  isPending,
}: {
  visible: boolean;
  properties: GAProperty[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={pickerStyles.overlay} onPress={onClose} />
      <View style={pickerStyles.sheet}>
        <View style={pickerStyles.handle} />
        <Text style={pickerStyles.title}>Select GA4 Property</Text>
        <ScrollView>
          {properties.length === 0 ? (
            <Text style={pickerStyles.empty}>No GA4 properties found</Text>
          ) : (
            properties.map(prop => (
              <Pressable
                key={prop.id}
                style={({ pressed }) => [pickerStyles.item, pressed && { opacity: 0.7 }]}
                onPress={() => { onSelect(prop.id); }}
                disabled={isPending}
              >
                <View style={pickerStyles.itemInner}>
                  <Text style={[pickerStyles.propName, prop.id === selectedId && { color: Colors.light.tint }]}>
                    {prop.displayName}
                  </Text>
                  <Text style={pickerStyles.propId}>{prop.id}</Text>
                </View>
                {prop.id === selectedId && <Feather name="check" size={16} color={Colors.light.tint} />}
              </Pressable>
            ))
          )}
        </ScrollView>
        <Pressable style={pickerStyles.closeBtn} onPress={onClose}>
          <Text style={pickerStyles.closeBtnText}>Close</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const pickerStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { backgroundColor: Colors.light.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32, maxHeight: "60%" },
  handle: { width: 40, height: 4, backgroundColor: Colors.light.border, borderRadius: 2, alignSelf: "center", marginTop: 10, marginBottom: 16 },
  title: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.light.text, paddingHorizontal: 20, marginBottom: 8 },
  empty: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, textAlign: "center", paddingVertical: 20 },
  item: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: Colors.light.border },
  itemInner: { flex: 1 },
  propName: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.light.text },
  propId: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, marginTop: 2 },
  closeBtn: { marginHorizontal: 20, marginTop: 12, paddingVertical: 12, backgroundColor: Colors.light.background, borderRadius: 12, alignItems: "center", borderWidth: 1, borderColor: Colors.light.border },
  closeBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.light.textSecondary },
});

export default function AnalyticsScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const isWeb = Platform.OS === "web";
  const [showPicker, setShowPicker] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: status, isLoading: statusLoading } = useQuery<GAStatus>({
    queryKey: ["/api/analytics/google/status"],
    queryFn: () => customFetch("/api/analytics/google/status").then((r: Response) => r.json()),
    refetchInterval: connecting ? 4000 : false,
  });

  const { data: properties, isLoading: propsLoading } = useQuery<{ properties: GAProperty[] }>({
    queryKey: ["/api/analytics/google/properties"],
    queryFn: () => customFetch("/api/analytics/google/properties").then((r: Response) => r.json()),
    enabled: status?.connected === true,
  });

  const { data: gaData, isLoading: dataLoading, refetch: refetchData, isRefetching } = useQuery<GAData>({
    queryKey: ["/api/analytics/google/data", status?.selectedPropertyId],
    queryFn: () =>
      customFetch("/api/analytics/google/data", {
        method: "POST",
        body: JSON.stringify({ propertyId: status?.selectedPropertyId }),
      }).then((r: Response) => r.json()),
    enabled: status?.connected === true && !!status?.selectedPropertyId,
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (status?.connected && connecting) {
      setConnecting(false);
      if (pollRef.current) clearInterval(pollRef.current);
    }
  }, [status?.connected, connecting]);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const connectMutation = useMutation({
    mutationFn: () => customFetch("/api/analytics/google/auth-url").then((r: Response) => r.json()),
    onSuccess: async (data: { url: string }) => {
      setConnecting(true);
      await Linking.openURL(data.url);
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => customFetch("/api/analytics/google/disconnect", { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/analytics/google/status"] }),
  });

  const selectPropertyMutation = useMutation({
    mutationFn: ({ propertyId }: { propertyId: string }) =>
      customFetch("/api/analytics/google/select-property", {
        method: "POST",
        body: JSON.stringify({ propertyId, email: status?.email ?? "" }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/google/status"] });
      setShowPicker(false);
    },
  });

  const selectedProp = properties?.properties.find(p => p.id === status?.selectedPropertyId);

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: (isWeb ? 67 : insets.top) + 16, paddingBottom: (isWeb ? 34 : insets.bottom) + 100 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => { refetchData(); queryClient.invalidateQueries({ queryKey: ["/api/analytics/google/status"] }); }}
            tintColor={Colors.light.tint}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Analytics</Text>
            <Text style={styles.subtitle}>Google Analytics 4</Text>
          </View>
          {status?.connected && gaData && (
            <Pressable
              onPress={() => refetchData()}
              style={({ pressed }) => [styles.refreshBtn, pressed && { opacity: 0.7 }]}
              disabled={dataLoading}
            >
              <Feather name="refresh-cw" size={16} color={Colors.light.tint} />
            </Pressable>
          )}
        </View>

        {statusLoading ? (
          <ActivityIndicator size="large" color={Colors.light.tint} style={{ marginTop: 48 }} />
        ) : !status?.configured ? (
          /* Not configured */
          <View style={styles.infoCard}>
            <View style={[styles.infoIcon, { backgroundColor: "#FEF3C7" }]}>
              <Feather name="alert-circle" size={28} color="#D97706" />
            </View>
            <Text style={styles.infoTitle}>Google OAuth not configured</Text>
            <Text style={styles.infoText}>
              Add your Google OAuth credentials in the web dashboard under{" "}
              <Text style={styles.infoStrong}>Settings → Google Analytics</Text> to enable this integration.
            </Text>
            <View style={styles.stepsBox}>
              {[
                "Enable Google Analytics Data API & Admin API in Google Cloud Console",
                "Create an OAuth 2.0 Client ID (Web application type)",
                "Add the Redirect URI from Settings → Google Analytics",
                "Paste Client ID and Secret into the web settings and save",
                "Return here and connect your account",
              ].map((step, i) => (
                <View key={i} style={styles.step}>
                  <View style={styles.stepNum}><Text style={styles.stepNumText}>{i + 1}</Text></View>
                  <Text style={styles.stepText}>{step}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : !status?.connected ? (
          /* Not connected */
          <View style={styles.infoCard}>
            <View style={[styles.infoIcon, { backgroundColor: `${Colors.light.tint}15` }]}>
              <Feather name="bar-chart-2" size={28} color={Colors.light.tint} />
            </View>
            <Text style={styles.infoTitle}>Connect Google Analytics</Text>
            <Text style={styles.infoText}>
              Sign in with your Google account to pull live metrics from your GA4 properties — active users, sessions, engagement rate, and more.
            </Text>
            {connecting && (
              <View style={styles.connectingRow}>
                <ActivityIndicator size="small" color={Colors.light.tint} />
                <Text style={styles.connectingText}>Waiting for sign-in to complete… Tap refresh if you've finished.</Text>
              </View>
            )}
            <Pressable
              style={({ pressed }) => [styles.connectBtn, pressed && { opacity: 0.8 }, connectMutation.isPending && { opacity: 0.6 }]}
              onPress={() => connectMutation.mutate()}
              disabled={connectMutation.isPending}
            >
              {connectMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Feather name="external-link" size={16} color="#fff" />
                  <Text style={styles.connectBtnText}>Sign in with Google</Text>
                </>
              )}
            </Pressable>
            {connecting && (
              <Pressable
                style={({ pressed }) => [styles.refreshStatusBtn, pressed && { opacity: 0.7 }]}
                onPress={() => queryClient.invalidateQueries({ queryKey: ["/api/analytics/google/status"] })}
              >
                <Feather name="refresh-cw" size={14} color={Colors.light.tint} />
                <Text style={styles.refreshStatusText}>Refresh status</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <>
            {/* Connected bar */}
            <View style={styles.connectedBar}>
              <View style={styles.connectedLeft}>
                <View style={styles.connectedDot} />
                <View>
                  <Text style={styles.connectedTitle}>Connected to Google Analytics</Text>
                  {status.email ? <Text style={styles.connectedEmail}>{status.email}</Text> : null}
                </View>
              </View>
              <Pressable
                onPress={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
                style={({ pressed }) => [styles.disconnectBtn, pressed && { opacity: 0.7 }]}
              >
                <Feather name="log-out" size={14} color={Colors.light.danger} />
              </Pressable>
            </View>

            {/* Property selector */}
            <Pressable
              style={({ pressed }) => [styles.propertyBtn, pressed && { opacity: 0.7 }]}
              onPress={() => setShowPicker(true)}
            >
              <Feather name="bar-chart-2" size={16} color={Colors.light.textSecondary} />
              <Text style={styles.propertyBtnText} numberOfLines={1}>
                {selectedProp?.displayName ?? (status.selectedPropertyId ? "Loading…" : "Select GA4 property")}
              </Text>
              <Feather name="chevron-down" size={16} color={Colors.light.textSecondary} />
            </Pressable>

            {!status.selectedPropertyId ? (
              <View style={styles.emptyState}>
                <Feather name="bar-chart-2" size={44} color={Colors.light.tabIconDefault} />
                <Text style={styles.emptyTitle}>Select a property above</Text>
                <Text style={styles.emptyText}>Choose a GA4 property to start seeing analytics data.</Text>
              </View>
            ) : dataLoading ? (
              <ActivityIndicator size="large" color={Colors.light.tint} style={{ marginTop: 48 }} />
            ) : gaData ? (
              <>
                {/* Active users — hero */}
                <View style={styles.heroCard}>
                  <View style={styles.heroIcon}>
                    <Feather name="activity" size={24} color={Colors.light.tint} />
                  </View>
                  <View>
                    <Text style={styles.heroLabel}>Active Users Right Now</Text>
                    <Text style={styles.heroValue}>{gaData.activeUsers.toLocaleString()}</Text>
                    <Text style={styles.heroSub}>Real-time · updates every 30s</Text>
                  </View>
                </View>

                {/* 30-day metrics grid */}
                <Text style={styles.sectionLabel}>LAST 30 DAYS</Text>
                <View style={styles.metricsGrid}>
                  <MetricCard icon="users" label="Total Users" value={gaData.totalUsers.toLocaleString()} sub="Last 30 days" iconBg="#DBEAFE" iconColor="#2563EB" />
                  <MetricCard icon="user-plus" label="New Users" value={gaData.newUsers.toLocaleString()} sub={`${gaData.totalUsers > 0 ? Math.round((gaData.newUsers / gaData.totalUsers) * 100) : 0}% of total`} iconBg="#EDE9FE" iconColor="#7C3AED" />
                  <MetricCard icon="mouse-pointer" label="Sessions" value={gaData.sessions.toLocaleString()} sub="Last 30 days" iconBg="#FFEDD5" iconColor="#EA580C" />
                  <MetricCard icon="eye" label="Page Views" value={gaData.pageViews.toLocaleString()} sub={`${gaData.sessions > 0 ? (gaData.pageViews / gaData.sessions).toFixed(1) : 0} per session`} iconBg="#CFFAFE" iconColor="#0891B2" />
                  <MetricCard icon="trending-up" label="Engagement Rate" value={`${gaData.engagementRate}%`} sub="Engaged sessions" iconBg="#D1FAE5" iconColor="#059669" />
                  <MetricCard icon="refresh-cw" label="Bounce Rate" value={`${gaData.bounceRate}%`} sub="Single-page sessions" iconBg={gaData.bounceRate > 60 ? "#FEE2E2" : "#FEF9C3"} iconColor={gaData.bounceRate > 60 ? "#DC2626" : "#CA8A04"} />
                  <MetricCard icon="clock" label="Avg Session" value={formatDuration(gaData.avgSessionDurationSec)} sub="Time per session" iconBg="#FCE7F3" iconColor="#DB2777" />
                </View>

                <Text style={styles.dataSource}>
                  Google Analytics 4 · {gaData.propertyId}
                </Text>
              </>
            ) : null}
          </>
        )}
      </ScrollView>

      {/* Property picker modal */}
      <PropertyPicker
        visible={showPicker}
        properties={properties?.properties ?? []}
        selectedId={status?.selectedPropertyId}
        onSelect={id => selectPropertyMutation.mutate({ propertyId: id })}
        onClose={() => setShowPicker(false)}
        isPending={selectPropertyMutation.isPending}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.light.background },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16 },

  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold", color: Colors.light.text },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, marginTop: 2 },
  refreshBtn: { padding: 8, borderRadius: 20, backgroundColor: `${Colors.light.tint}12` },

  infoCard: { backgroundColor: Colors.light.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.light.border, padding: 24, alignItems: "center", gap: 12 },
  infoIcon: { width: 60, height: 60, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  infoTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.light.text, textAlign: "center" },
  infoText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, textAlign: "center", lineHeight: 20 },
  infoStrong: { fontFamily: "Inter_600SemiBold", color: Colors.light.text },

  stepsBox: { backgroundColor: Colors.light.background, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: Colors.light.border, alignSelf: "stretch", gap: 12 },
  step: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  stepNum: { width: 20, height: 20, borderRadius: 10, backgroundColor: `${Colors.light.tint}20`, alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 },
  stepNumText: { fontSize: 11, fontFamily: "Inter_700Bold", color: Colors.light.tint },
  stepText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, flex: 1, lineHeight: 18 },

  connectingRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: `${Colors.light.tint}10`, borderRadius: 10, padding: 12, alignSelf: "stretch" },
  connectingText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, flex: 1, lineHeight: 18 },

  connectBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.light.tint, paddingVertical: 14, paddingHorizontal: 28, borderRadius: 12, marginTop: 4 },
  connectBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
  refreshStatusBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 10 },
  refreshStatusText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.light.tint },

  connectedBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: Colors.light.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.light.border, padding: 14, marginBottom: 10 },
  connectedLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  connectedDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.light.success },
  connectedTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  connectedEmail: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, marginTop: 2 },
  disconnectBtn: { padding: 8 },

  propertyBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.light.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.light.border, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16 },
  propertyBtnText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.light.text },

  heroCard: { flexDirection: "row", alignItems: "center", gap: 16, backgroundColor: `${Colors.light.tint}08`, borderRadius: 16, borderWidth: 1, borderColor: `${Colors.light.tint}30`, padding: 20, marginBottom: 16 },
  heroIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: `${Colors.light.tint}15`, alignItems: "center", justifyContent: "center" },
  heroLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  heroValue: { fontSize: 44, fontFamily: "Inter_700Bold", color: Colors.light.tint, lineHeight: 52 },
  heroSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary },

  sectionLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: Colors.light.textSecondary, letterSpacing: 1, marginBottom: 10 },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },

  dataSource: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.light.tabIconDefault, textAlign: "right", marginBottom: 8 },

  emptyState: { alignItems: "center", paddingTop: 60 },
  emptyTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", color: Colors.light.text, marginTop: 14 },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, marginTop: 6, textAlign: "center", paddingHorizontal: 32 },
});
