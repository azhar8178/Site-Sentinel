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
  TextInput,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import {
  useListServers,
  useCreateServer,
  useDeleteServer,
  useGetServerMetrics,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import Colors from "@/constants/colors";
import { SimpleChart } from "@/components/SimpleChart";
import { useAuth } from "@/contexts/AuthContext";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatPercent(value: number): string {
  return value.toFixed(1) + "%";
}

function GaugeBar({ value, label, color }: { value: number; label: string; color: string }) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <View style={gaugeStyles.container}>
      <View style={gaugeStyles.labelRow}>
        <Text style={gaugeStyles.label}>{label}</Text>
        <Text style={[gaugeStyles.value, { color }]}>{formatPercent(value)}</Text>
      </View>
      <View style={gaugeStyles.track}>
        <View style={[gaugeStyles.fill, { width: `${clamped}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function getStatusColor(percent: number): string {
  if (percent >= 90) return Colors.light.danger;
  if (percent >= 70) return Colors.light.warning;
  return Colors.light.success;
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

function ServerDetailModal({
  serverId,
  serverName,
  visible,
  onClose,
}: {
  serverId: number;
  serverName: string;
  visible: boolean;
  onClose: () => void;
}) {
  const [hours, setHours] = useState(1);
  const { data: metrics, isLoading } = useGetServerMetrics(serverId, { hours }, {
    query: { enabled: visible, refetchInterval: 30000 },
  });

  const cpuData = (metrics ?? []).map((m: any) => ({
    value: m.cpuPercent,
    label: new Date(m.recordedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    isUp: m.cpuPercent < 90,
  }));

  const memData = (metrics ?? []).map((m: any) => ({
    value: m.memTotalBytes > 0 ? (m.memUsedBytes / m.memTotalBytes) * 100 : 0,
    isUp: m.memTotalBytes > 0 ? (m.memUsedBytes / m.memTotalBytes) < 0.9 : true,
  }));

  const diskData = (metrics ?? []).map((m: any) => ({
    value: m.diskTotalBytes > 0 ? (m.diskUsedBytes / m.diskTotalBytes) * 100 : 0,
    isUp: m.diskTotalBytes > 0 ? (m.diskUsedBytes / m.diskTotalBytes) < 0.9 : true,
  }));

  const latest = metrics && metrics.length > 0 ? metrics[metrics.length - 1] : null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={modalStyles.container}>
        <View style={modalStyles.header}>
          <Pressable onPress={onClose} style={modalStyles.closeBtn}>
            <Feather name="x" size={24} color={Colors.light.text} />
          </Pressable>
          <Text style={modalStyles.title}>{serverName}</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView contentContainerStyle={modalStyles.content}>
          {isLoading ? (
            <ActivityIndicator size="large" color={Colors.light.tint} style={{ marginTop: 40 }} />
          ) : (
            <>
              {latest && (
                <View style={modalStyles.statsRow}>
                  <View style={modalStyles.statBox}>
                    <Text style={modalStyles.statLabel}>Load (1m)</Text>
                    <Text style={modalStyles.statValue}>{(latest as any).loadAvg1m?.toFixed(2)}</Text>
                  </View>
                  <View style={modalStyles.statBox}>
                    <Text style={modalStyles.statLabel}>Load (5m)</Text>
                    <Text style={modalStyles.statValue}>{(latest as any).loadAvg5m?.toFixed(2)}</Text>
                  </View>
                  <View style={modalStyles.statBox}>
                    <Text style={modalStyles.statLabel}>Load (15m)</Text>
                    <Text style={modalStyles.statValue}>{(latest as any).loadAvg15m?.toFixed(2)}</Text>
                  </View>
                </View>
              )}

              {latest && (
                <View style={modalStyles.statsRow}>
                  <View style={modalStyles.statBox}>
                    <Text style={modalStyles.statLabel}>Memory</Text>
                    <Text style={modalStyles.statValue}>
                      {formatBytes((latest as any).memUsedBytes)} / {formatBytes((latest as any).memTotalBytes)}
                    </Text>
                  </View>
                  <View style={modalStyles.statBox}>
                    <Text style={modalStyles.statLabel}>Disk</Text>
                    <Text style={modalStyles.statValue}>
                      {formatBytes((latest as any).diskUsedBytes)} / {formatBytes((latest as any).diskTotalBytes)}
                    </Text>
                  </View>
                </View>
              )}

              {latest && (
                <View style={modalStyles.statsRow}>
                  <View style={modalStyles.statBox}>
                    <Text style={modalStyles.statLabel}>Network RX</Text>
                    <Text style={modalStyles.statValue}>{formatBytes((latest as any).netRxBytes)}</Text>
                  </View>
                  <View style={modalStyles.statBox}>
                    <Text style={modalStyles.statLabel}>Network TX</Text>
                    <Text style={modalStyles.statValue}>{formatBytes((latest as any).netTxBytes)}</Text>
                  </View>
                </View>
              )}

              <View style={modalStyles.chartSection}>
                <Text style={modalStyles.chartTitle}>CPU Usage</Text>
                <SimpleChart data={cpuData} height={100} showLabels />
              </View>

              <View style={modalStyles.chartSection}>
                <Text style={modalStyles.chartTitle}>Memory Usage</Text>
                <SimpleChart data={memData} height={100} />
              </View>

              <View style={modalStyles.chartSection}>
                <Text style={modalStyles.chartTitle}>Disk Usage</Text>
                <SimpleChart data={diskData} height={100} />
              </View>

              <View style={modalStyles.periodRow}>
                {[1, 6, 24].map((h) => (
                  <Pressable
                    key={h}
                    onPress={() => setHours(h)}
                    style={[modalStyles.periodBtn, hours === h && modalStyles.periodBtnActive]}
                  >
                    <Text style={[modalStyles.periodText, hours === h && modalStyles.periodTextActive]}>
                      {h}h
                    </Text>
                  </Pressable>
                ))}
              </View>

              {(!metrics || metrics.length === 0) && !isLoading && (
                <View style={modalStyles.emptyState}>
                  <Feather name="inbox" size={40} color={Colors.light.tabIconDefault} />
                  <Text style={modalStyles.emptyText}>No metrics data yet</Text>
                  <Text style={modalStyles.emptySubtext}>Install the agent on this server to start collecting data</Text>
                </View>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function ServersScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const isWeb = Platform.OS === "web";
  const { canEditConfig } = useAuth();
  const { data: servers, isLoading, refetch, isRefetching } = useListServers({
    query: { refetchInterval: 30000 },
  });
  const createServer = useCreateServer();
  const deleteServer = useDeleteServer();

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newHostname, setNewHostname] = useState("");
  const [selectedServer, setSelectedServer] = useState<{ id: number; name: string } | null>(null);
  const [showApiKey, setShowApiKey] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!newName.trim() || !newHostname.trim()) return;
    try {
      const result = await createServer.mutateAsync({
        data: { name: newName.trim(), hostname: newHostname.trim() },
      });
      setShowAdd(false);
      setNewName("");
      setNewHostname("");
      setShowApiKey((result as any).apiKey);
      queryClient.invalidateQueries({ queryKey: ["/api/servers"] });
    } catch {}
  };

  const handleDelete = (id: number, name: string) => {
    const confirmed = Platform.OS === "web"
      ? window.confirm(`Delete server "${name}"? This removes all its metrics data.`)
      : true;
    if (confirmed) {
      deleteServer.mutateAsync({ serverId: id }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/servers"] });
      });
    }
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
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.light.tint} />
        }
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Servers</Text>
            <Text style={styles.subtitle}>
              {isLoading ? "Loading..." : `${servers?.length ?? 0} servers monitored`}
            </Text>
          </View>
          {canEditConfig && (
            <Pressable onPress={() => setShowAdd(true)} style={styles.addBtn}>
              <Feather name="plus" size={20} color="#fff" />
            </Pressable>
          )}
        </View>

        {showAdd && (
          <View style={styles.addCard}>
            <TextInput
              style={styles.input}
              placeholder="Server name (e.g. IE Production)"
              value={newName}
              onChangeText={setNewName}
              placeholderTextColor={Colors.light.tabIconDefault}
            />
            <TextInput
              style={styles.input}
              placeholder="Hostname (e.g. ec2-xx-xx.compute.amazonaws.com)"
              value={newHostname}
              onChangeText={setNewHostname}
              placeholderTextColor={Colors.light.tabIconDefault}
            />
            <View style={styles.addActions}>
              <Pressable onPress={() => setShowAdd(false)} style={styles.cancelBtn}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleAdd} style={styles.saveBtn}>
                <Text style={styles.saveText}>Add Server</Text>
              </Pressable>
            </View>
          </View>
        )}

        {showApiKey && (
          <View style={[styles.addCard, { backgroundColor: Colors.light.successBg }]}>
            <Text style={[styles.cardTitle, { color: Colors.light.success }]}>Server Added!</Text>
            <Text style={styles.apiKeyLabel}>Install the agent on your server with this API key:</Text>
            <View style={styles.apiKeyBox}>
              <Text style={styles.apiKeyText} selectable>{showApiKey}</Text>
            </View>
            <Text style={styles.apiKeyHint}>
              Copy this key now — you won't be able to see it again in the list view.
              {"\n\n"}Install the agent:{"\n"}
              <Text style={styles.codeText}>
                curl -sL https://your-domain/agent/install.sh | sudo bash -s -- https://your-domain {showApiKey}
              </Text>
            </Text>
            <Pressable onPress={() => setShowApiKey(null)} style={styles.saveBtn}>
              <Text style={styles.saveText}>Got it</Text>
            </Pressable>
          </View>
        )}

        {isLoading ? (
          <ActivityIndicator size="large" color={Colors.light.tint} style={{ marginTop: 40 }} />
        ) : servers?.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="server" size={48} color={Colors.light.tabIconDefault} />
            <Text style={styles.emptyTitle}>No Servers</Text>
            <Text style={styles.emptyText}>
              Add a server and install the monitoring agent to start tracking CPU, memory, disk, and network usage.
            </Text>
          </View>
        ) : (
          (servers ?? []).map((server: any) => {
            const m = server.latestMetrics;
            const isOnline = server.lastSeenAt && (Date.now() - new Date(server.lastSeenAt).getTime()) < 120000;
            const cpuPct = m?.cpuPercent ?? 0;
            const memPct = m && m.memTotalBytes > 0 ? (m.memUsedBytes / m.memTotalBytes) * 100 : 0;
            const diskPct = m && m.diskTotalBytes > 0 ? (m.diskUsedBytes / m.diskTotalBytes) * 100 : 0;

            return (
              <Pressable
                key={server.id}
                style={styles.serverCard}
                onPress={() => setSelectedServer({ id: server.id, name: server.name })}
              >
                <View style={styles.serverHeader}>
                  <View style={styles.serverInfo}>
                    <View style={[styles.statusDot, { backgroundColor: isOnline ? Colors.light.success : Colors.light.tabIconDefault }]} />
                    <View>
                      <Text style={styles.serverName}>{server.name}</Text>
                      <Text style={styles.serverHostname}>{server.hostname}</Text>
                    </View>
                  </View>
                  <View style={styles.serverActions}>
                    <Text style={styles.lastSeen}>{timeSince(server.lastSeenAt)}</Text>
                    {canEditConfig && (
                      <Pressable onPress={() => handleDelete(server.id, server.name)} hitSlop={8}>
                        <Feather name="trash-2" size={16} color={Colors.light.danger} />
                      </Pressable>
                    )}
                  </View>
                </View>

                {m ? (
                  <View style={styles.gauges}>
                    <GaugeBar value={cpuPct} label="CPU" color={getStatusColor(cpuPct)} />
                    <GaugeBar value={memPct} label="Memory" color={getStatusColor(memPct)} />
                    <GaugeBar value={diskPct} label="Disk" color={getStatusColor(diskPct)} />
                    <View style={styles.loadRow}>
                      <Text style={styles.loadLabel}>Load: {m.loadAvg1m?.toFixed(2)} / {m.loadAvg5m?.toFixed(2)} / {m.loadAvg15m?.toFixed(2)}</Text>
                      <Text style={styles.loadLabel}>Net: {formatBytes(m.netRxBytes)} rx / {formatBytes(m.netTxBytes)} tx</Text>
                    </View>
                  </View>
                ) : (
                  <Text style={styles.noData}>No metrics received yet — install the agent</Text>
                )}
              </Pressable>
            );
          })
        )}
      </ScrollView>

      {selectedServer && (
        <ServerDetailModal
          serverId={selectedServer.id}
          serverName={selectedServer.name}
          visible={!!selectedServer}
          onClose={() => setSelectedServer(null)}
        />
      )}
    </View>
  );
}

const gaugeStyles = StyleSheet.create({
  container: { marginBottom: 8 },
  labelRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  label: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  value: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  track: { height: 6, backgroundColor: Colors.light.border, borderRadius: 3, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3 },
});

const modalStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.light.border },
  closeBtn: { padding: 4 },
  title: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  content: { padding: 16 },
  statsRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
  statBox: { flex: 1, backgroundColor: Colors.light.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.light.border },
  statLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary, marginBottom: 4 },
  statValue: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  chartSection: { backgroundColor: Colors.light.surface, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.light.border },
  chartTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.light.text, marginBottom: 12 },
  periodRow: { flexDirection: "row", justifyContent: "center", gap: 12, marginTop: 8, marginBottom: 20 },
  periodBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  periodBtnActive: { backgroundColor: Colors.light.tint, borderColor: Colors.light.tint },
  periodText: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  periodTextActive: { color: "#fff" },
  emptyState: { alignItems: "center", paddingTop: 60 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary, marginTop: 12 },
  emptySubtext: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.light.tabIconDefault, marginTop: 4, textAlign: "center", paddingHorizontal: 40 },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.light.background },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", color: Colors.light.text },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, marginTop: 2 },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.light.tint, alignItems: "center", justifyContent: "center" },
  addCard: { backgroundColor: Colors.light.surface, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: Colors.light.border },
  input: { backgroundColor: Colors.light.background, borderRadius: 10, padding: 12, marginBottom: 10, fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.light.text, borderWidth: 1, borderColor: Colors.light.border },
  addActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 4 },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  cancelText: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  saveBtn: { backgroundColor: Colors.light.tint, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  saveText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  cardTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 8 },
  apiKeyLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, marginBottom: 8 },
  apiKeyBox: { backgroundColor: Colors.light.background, borderRadius: 8, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: Colors.light.border },
  apiKeyText: { fontSize: 12, fontFamily: Platform.OS === "web" ? "monospace" : "Inter_400Regular", color: Colors.light.text },
  apiKeyHint: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, marginBottom: 12, lineHeight: 18 },
  codeText: { fontFamily: Platform.OS === "web" ? "monospace" : "Inter_400Regular", fontSize: 11, color: Colors.light.text },
  emptyState: { alignItems: "center", paddingTop: 60 },
  emptyTitle: { fontSize: 20, fontFamily: "Inter_600SemiBold", color: Colors.light.text, marginTop: 16 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, marginTop: 8, textAlign: "center", paddingHorizontal: 40, lineHeight: 20 },
  serverCard: { backgroundColor: Colors.light.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.light.border },
  serverHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  serverInfo: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  serverName: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  serverHostname: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, marginTop: 2 },
  serverActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  lastSeen: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary },
  gauges: { gap: 2 },
  loadRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  loadLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary },
  noData: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.light.tabIconDefault, fontStyle: "italic" },
});
