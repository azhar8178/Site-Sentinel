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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react/custom-fetch";

import Colors from "@/constants/colors";

interface HealthReport {
  generatedAt: string;
  overallStatus: "operational" | "degraded" | "outage";
  companyName: string;
  sites: {
    id: number;
    name: string;
    url: string;
    currentStatus: string;
    lastResponseTimeMs: number | null;
    lastCheckedAt: string | null;
  }[];
  servers: {
    id: number;
    name: string;
    hostname: string;
    isOnline: boolean;
    lastSeenAt: string | null;
    metrics: {
      cpuPercent: number;
      memPercent: number | null;
      diskPercent: number | null;
      loadAvg1m: number;
      loadAvg5m: number;
      loadAvg15m: number;
      connectionCount: number | null;
    } | null;
    services: {
      phpFpm: { active: number; idle: number; total: number } | null;
      mysql: { threads: number; slowQueries: number } | null;
      nginx: { isRunning: boolean; activeConnections: number | null } | null;
      varnish: { isRunning: boolean; hitRate: number | null } | null;
      elasticsearch: { isRunning: boolean; status: string | null } | null;
      sslExpiry: { domain: string; expiresAt?: string; daysRemaining: number; isExpired: boolean; isExpiringSoon: boolean }[] | null;
    } | null;
  }[];
}

function MiniBar({ value, warn = 80, danger = 90 }: { value: number | null; warn?: number; danger?: number }) {
  if (value === null) return <Text style={barStyles.null}>—</Text>;
  const clamped = Math.min(100, Math.max(0, value));
  const color = value >= danger ? Colors.light.danger : value >= warn ? Colors.light.warning : Colors.light.success;
  const textColor = value >= danger ? Colors.light.danger : value >= warn ? Colors.light.warning : Colors.light.text;
  return (
    <View style={barStyles.row}>
      <View style={barStyles.track}>
        <View style={[barStyles.fill, { width: `${clamped}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={[barStyles.pct, { color: textColor }]}>{value}%</Text>
    </View>
  );
}

const barStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  track: { flex: 1, height: 5, backgroundColor: Colors.light.border, borderRadius: 3, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3 },
  pct: { fontSize: 11, fontFamily: "Inter_600SemiBold", width: 34, textAlign: "right" },
  null: { fontSize: 11, color: Colors.light.tabIconDefault },
});

function ServiceDot({ ok, label }: { ok: boolean | null; label: string }) {
  const dotColor = ok === null ? Colors.light.tabIconDefault : ok ? Colors.light.success : Colors.light.danger;
  const textColor = ok === null ? Colors.light.textSecondary : ok ? Colors.light.text : Colors.light.danger;
  return (
    <View style={svcStyles.row}>
      <View style={[svcStyles.dot, { backgroundColor: dotColor }]} />
      <Text style={[svcStyles.label, { color: textColor }]}>{label}</Text>
    </View>
  );
}

const svcStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 4, marginRight: 12, marginBottom: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  label: { fontSize: 12, fontFamily: "Inter_500Medium" },
});

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

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const isWeb = Platform.OS === "web";

  const { data: report, isLoading, isRefetching, refetch } = useQuery<HealthReport>({
    queryKey: ["/api/health-report"],
    queryFn: () => customFetch("/api/health-report").then((r: Response) => r.json()),
    refetchInterval: 60000,
  });

  const sitesUp = report?.sites.filter(s => s.currentStatus === "up").length ?? 0;
  const sitesTotal = report?.sites.length ?? 0;

  const serversOnline = report?.servers.filter(s => s.isOnline).length ?? 0;
  const serversTotal = report?.servers.length ?? 0;

  const allSslEntries = report?.servers.flatMap(s => s.services?.sslExpiry ?? []) ?? [];
  const minSslDays = allSslEntries.length > 0 ? Math.min(...allSslEntries.map(e => e.daysRemaining)) : null;
  const hasExpiredSsl = allSslEntries.some(e => e.isExpired);
  const hasWarningSsl = allSslEntries.some(e => e.isExpiringSoon);

  const allServices = (report?.servers ?? []).flatMap(s => {
    if (!s.services) return [];
    const { nginx, varnish, phpFpm, mysql, elasticsearch } = s.services;
    return [
      nginx !== null ? nginx.isRunning : null,
      varnish !== null ? varnish.isRunning : null,
      phpFpm !== null ? phpFpm.total > 0 : null,
      mysql !== null ? true : null,
      elasticsearch !== null ? elasticsearch.isRunning : null,
    ].filter((v): v is boolean => v !== null);
  });
  const servicesOk = allServices.filter(Boolean).length;
  const servicesTotal = allServices.length;

  const isOperational = report?.overallStatus === "operational";
  const anyDown = (report?.sites.some(s => s.currentStatus === "down")) ?? false;

  const statStrip = [
    {
      icon: "globe" as const,
      label: "Sites",
      value: sitesTotal === 0 ? "—" : `${sitesUp}/${sitesTotal}`,
      note: sitesUp === sitesTotal ? "All live" : `${sitesTotal - sitesUp} down`,
      ok: sitesUp === sitesTotal && sitesTotal > 0,
    },
    {
      icon: "server" as const,
      label: "Servers",
      value: serversTotal === 0 ? "—" : `${serversOnline}/${serversTotal}`,
      note: serversTotal === 0 ? "None added" : serversOnline === serversTotal ? "All online" : `${serversTotal - serversOnline} offline`,
      ok: serversTotal > 0 && serversOnline === serversTotal,
    },
    {
      icon: "activity" as const,
      label: "Services",
      value: servicesTotal === 0 ? "—" : `${servicesOk}/${servicesTotal}`,
      note: servicesTotal === 0 ? "No data" : servicesOk === servicesTotal ? "All healthy" : "Issue detected",
      ok: servicesTotal > 0 && servicesOk === servicesTotal,
    },
    {
      icon: "lock" as const,
      label: "SSL",
      value: minSslDays !== null ? `${minSslDays}d` : "—",
      note: minSslDays !== null ? (hasExpiredSsl ? "Expired!" : hasWarningSsl ? "Expiring soon" : "All valid") : "Not tracked",
      ok: minSslDays !== null && !hasExpiredSsl && !hasWarningSsl,
    },
  ];

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
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Dashboard</Text>
            <Text style={styles.subtitle}>
              {isLoading ? "Loading…" : `Last updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
            </Text>
          </View>
          <Pressable
            onPress={() => { refetch(); queryClient.invalidateQueries({ queryKey: ["/api/health-report"] }); }}
            style={({ pressed }) => [styles.refreshBtn, pressed && { opacity: 0.7 }]}
          >
            <Feather name="refresh-cw" size={16} color={Colors.light.tint} />
          </Pressable>
        </View>

        {/* Status banner */}
        {!isLoading && report && (
          <View style={[
            styles.statusBanner,
            { backgroundColor: isOperational ? Colors.light.successBg : Colors.light.dangerBg },
          ]}>
            <View style={[styles.statusDotLarge, { backgroundColor: isOperational ? Colors.light.success : Colors.light.danger }]} />
            <Text style={[styles.statusText, { color: isOperational ? Colors.light.success : Colors.light.danger }]}>
              {isOperational ? "All Systems Operational" : "System Degraded"}
            </Text>
          </View>
        )}

        {isLoading ? (
          <ActivityIndicator size="large" color={Colors.light.tint} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Stat strip */}
            <View style={styles.statStrip}>
              {statStrip.map(stat => (
                <View key={stat.label} style={styles.statCard}>
                  <View style={[styles.statIcon, { backgroundColor: stat.ok ? `${Colors.light.success}18` : Colors.light.background }]}>
                    <Feather name={stat.icon} size={14} color={stat.ok ? Colors.light.success : Colors.light.tabIconDefault} />
                  </View>
                  <Text style={styles.statLabel}>{stat.label}</Text>
                  <Text style={styles.statValue}>{stat.value}</Text>
                  <Text style={[styles.statNote, { color: stat.ok ? Colors.light.success : Colors.light.textSecondary }]} numberOfLines={1}>
                    {stat.note}
                  </Text>
                </View>
              ))}
            </View>

            {/* Sites */}
            {(report?.sites.length ?? 0) > 0 && (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Feather name="globe" size={14} color={Colors.light.textSecondary} />
                  <Text style={styles.cardTitle}>Store Availability</Text>
                </View>
                {report!.sites.map((site, idx) => {
                  const isUp = site.currentStatus === "up";
                  const isSlow = site.currentStatus === "slow";
                  const dotColor = isUp ? Colors.light.success : isSlow ? Colors.light.warning : Colors.light.danger;
                  const badgeBg = isUp ? Colors.light.successBg : isSlow ? `${Colors.light.warning}20` : Colors.light.dangerBg;
                  const badgeColor = isUp ? Colors.light.success : isSlow ? Colors.light.warning : Colors.light.danger;
                  return (
                    <View key={site.id} style={[styles.siteRow, idx > 0 && styles.siteRowBorder]}>
                      <View style={[styles.siteDot, { backgroundColor: dotColor }]} />
                      <View style={styles.siteInfo}>
                        <Text style={styles.siteName}>{site.name}</Text>
                        <Text style={styles.siteUrl} numberOfLines={1}>{site.url.replace(/^https?:\/\//, "")}</Text>
                      </View>
                      <View style={styles.siteRight}>
                        <View style={[styles.badge, { backgroundColor: badgeBg }]}>
                          <Text style={[styles.badgeText, { color: badgeColor }]}>{site.currentStatus.toUpperCase()}</Text>
                        </View>
                        {site.lastResponseTimeMs != null && (
                          <Text style={styles.responseTime}>{(site.lastResponseTimeMs / 1000).toFixed(2)}s</Text>
                        )}
                      </View>
                    </View>
                  );
                })}
                {report!.sites[0]?.lastCheckedAt && (
                  <View style={styles.cardFooter}>
                    <Feather name="clock" size={11} color={Colors.light.tabIconDefault} />
                    <Text style={styles.cardFooterText}>Checked {timeSince(report!.sites[0].lastCheckedAt)}</Text>
                  </View>
                )}
              </View>
            )}

            {/* Servers */}
            {(report?.servers.length ?? 0) > 0 && report!.servers.map(server => {
              const svc = server.services;
              const nginxOk = svc?.nginx != null ? svc.nginx.isRunning : null;
              const varnishOk = svc?.varnish != null ? svc.varnish.isRunning : null;
              const phpOk = svc?.phpFpm != null ? svc.phpFpm.total > 0 : null;
              const mysqlOk = svc?.mysql != null ? true : null;
              const esOk = svc?.elasticsearch != null ? svc.elasticsearch.isRunning && svc.elasticsearch.status !== "red" : null;

              return (
                <View key={server.id} style={styles.card}>
                  {/* Server header */}
                  <View style={styles.serverHeader}>
                    <View style={[styles.serverIcon, { backgroundColor: server.isOnline ? `${Colors.light.success}18` : `${Colors.light.danger}12` }]}>
                      <Feather name="server" size={14} color={server.isOnline ? Colors.light.success : Colors.light.danger} />
                    </View>
                    <View style={styles.serverInfo}>
                      <Text style={styles.serverName}>{server.name}</Text>
                      <Text style={styles.serverHost}>{server.hostname}</Text>
                    </View>
                    <View style={styles.serverRight}>
                      <View style={[styles.badge, { backgroundColor: server.isOnline ? Colors.light.successBg : Colors.light.dangerBg }]}>
                        <Text style={[styles.badgeText, { color: server.isOnline ? Colors.light.success : Colors.light.danger }]}>
                          {server.isOnline ? "Online" : "Offline"}
                        </Text>
                      </View>
                      <Text style={styles.lastSeen}>{timeSince(server.lastSeenAt)}</Text>
                    </View>
                  </View>

                  {/* Vitals */}
                  {server.metrics ? (
                    <View style={styles.vitals}>
                      {[
                        { label: "CPU", value: server.metrics.cpuPercent },
                        { label: "Memory", value: server.metrics.memPercent },
                        { label: "Disk", value: server.metrics.diskPercent },
                      ].filter(v => v.value !== null).map(v => (
                        <View key={v.label} style={styles.vitalRow}>
                          <Text style={styles.vitalLabel}>{v.label}</Text>
                          <MiniBar value={v.value} />
                        </View>
                      ))}
                      <Text style={styles.loadText}>
                        Load {server.metrics.loadAvg1m?.toFixed(2) ?? "—"} / {server.metrics.loadAvg5m?.toFixed(2) ?? "—"} / {server.metrics.loadAvg15m?.toFixed(2) ?? "—"}
                        {server.metrics.connectionCount != null ? `   ·   ${server.metrics.connectionCount} conns` : ""}
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.noMetrics}>
                      {server.isOnline ? "Waiting for first metrics report…" : "No metrics — server offline"}
                    </Text>
                  )}

                  {/* Service dots */}
                  {svc && (
                    <View style={styles.serviceRow}>
                      {svc.nginx !== null && <ServiceDot ok={nginxOk} label="Nginx" />}
                      {svc.varnish !== null && <ServiceDot ok={varnishOk} label="Varnish" />}
                      {svc.phpFpm !== null && <ServiceDot ok={phpOk} label="PHP-FPM" />}
                      {svc.mysql !== null && <ServiceDot ok={mysqlOk} label="MySQL" />}
                      {svc.elasticsearch !== null && <ServiceDot ok={esOk} label="Elasticsearch" />}
                    </View>
                  )}
                </View>
              );
            })}

            {/* SSL Certificates */}
            {allSslEntries.length > 0 && (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Feather name="shield" size={14} color={Colors.light.textSecondary} />
                  <Text style={styles.cardTitle}>SSL Certificates</Text>
                </View>
                {/* Column headers */}
                <View style={[styles.sslRow, styles.sslHeaderRow]}>
                  <Text style={[styles.sslCell, styles.sslDomainCell, styles.sslHeader]}>Domain</Text>
                  <Text style={[styles.sslCell, styles.sslStatusCell, styles.sslHeader]}>Status</Text>
                  <Text style={[styles.sslCell, styles.sslDaysCell, styles.sslHeader]}>Days</Text>
                </View>
                {allSslEntries.map((e, idx) => {
                  const ok = !e.isExpired && !e.isExpiringSoon;
                  const dotColor = ok ? Colors.light.success : e.isExpiringSoon ? Colors.light.warning : Colors.light.danger;
                  const statusText = e.isExpired ? "Expired" : e.isExpiringSoon ? "Soon" : "Valid";
                  const statusColor = ok ? Colors.light.success : e.isExpiringSoon ? Colors.light.warning : Colors.light.danger;
                  const daysColor = e.isExpired ? Colors.light.danger : e.isExpiringSoon ? Colors.light.warning : Colors.light.textSecondary;
                  return (
                    <View key={e.domain} style={[styles.sslRow, idx > 0 && styles.sslRowBorder]}>
                      <Text style={[styles.sslCell, styles.sslDomainCell, styles.sslDomainText]} numberOfLines={1}>{e.domain}</Text>
                      <View style={[styles.sslCell, styles.sslStatusCell, { flexDirection: "row", alignItems: "center", gap: 4 }]}>
                        <View style={[styles.sslDot, { backgroundColor: dotColor }]} />
                        <Text style={[styles.sslStatusText, { color: statusColor }]}>{statusText}</Text>
                      </View>
                      <Text style={[styles.sslCell, styles.sslDaysCell, styles.sslDaysText, { color: daysColor }]}>
                        {e.isExpired ? "Expired" : `${e.daysRemaining}d`}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Empty state */}
            {sitesTotal === 0 && serversTotal === 0 && (
              <View style={styles.emptyState}>
                <Feather name="activity" size={48} color={Colors.light.tabIconDefault} />
                <Text style={styles.emptyTitle}>Nothing to monitor yet</Text>
                <Text style={styles.emptyText}>Add a site or server to start seeing data here.</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.light.background },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16 },

  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold", color: Colors.light.text },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, marginTop: 2 },
  refreshBtn: { padding: 8, borderRadius: 20, backgroundColor: `${Colors.light.tint}12` },

  statusBanner: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, marginBottom: 14 },
  statusDotLarge: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  statStrip: { flexDirection: "row", gap: 8, marginBottom: 14 },
  statCard: { flex: 1, backgroundColor: Colors.light.surface, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: Colors.light.border },
  statIcon: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  statLabel: { fontSize: 10, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary, textTransform: "uppercase", letterSpacing: 0.3 },
  statValue: { fontSize: 17, fontFamily: "Inter_700Bold", color: Colors.light.text, marginTop: 2 },
  statNote: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2 },

  card: { backgroundColor: Colors.light.surface, borderRadius: 14, borderWidth: 1, borderColor: Colors.light.border, marginBottom: 12, overflow: "hidden" },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10 },
  cardTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  cardFooter: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.light.border, backgroundColor: `${Colors.light.border}40` },
  cardFooterText: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.light.tabIconDefault },

  siteRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 11, gap: 10 },
  siteRowBorder: { borderTopWidth: 1, borderTopColor: Colors.light.border },
  siteDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  siteInfo: { flex: 1, minWidth: 0 },
  siteName: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  siteUrl: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, marginTop: 1 },
  siteRight: { alignItems: "flex-end", gap: 3 },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.3 },
  responseTime: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary },

  serverHeader: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14 },
  serverIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  serverInfo: { flex: 1, minWidth: 0 },
  serverName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  serverHost: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, marginTop: 1 },
  serverRight: { alignItems: "flex-end", gap: 3 },
  lastSeen: { fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.light.tabIconDefault },

  vitals: { paddingHorizontal: 14, paddingBottom: 10, gap: 6, borderTopWidth: 1, borderTopColor: Colors.light.border, paddingTop: 10 },
  vitalRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  vitalLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary, width: 48 },
  loadText: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, marginTop: 2 },
  noMetrics: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.tabIconDefault, paddingHorizontal: 14, paddingBottom: 12, fontStyle: "italic" },

  serviceRow: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 14, paddingBottom: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.light.border },

  sslRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 9 },
  sslHeaderRow: { borderTopWidth: 1, borderTopColor: Colors.light.border, backgroundColor: `${Colors.light.border}40` },
  sslRowBorder: { borderTopWidth: 1, borderTopColor: Colors.light.border },
  sslCell: { },
  sslDomainCell: { flex: 1 },
  sslStatusCell: { width: 72 },
  sslDaysCell: { width: 52, textAlign: "right" },
  sslHeader: { fontSize: 10, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary, textTransform: "uppercase" },
  sslDomainText: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.light.text },
  sslDot: { width: 6, height: 6, borderRadius: 3 },
  sslStatusText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  sslDaysText: { fontSize: 11, fontFamily: "Inter_600SemiBold", textAlign: "right" },

  emptyState: { alignItems: "center", paddingTop: 60 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.light.text, marginTop: 16 },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, marginTop: 6, textAlign: "center", paddingHorizontal: 32 },
});
