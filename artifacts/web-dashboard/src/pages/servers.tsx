import { useState } from "react";
import { customFetch, useListServers, useCreateServer, useDeleteServer, useUpdateServer, useRegenerateServerKey, useGetServerMetrics, useGetServerLogSnapshots, useGetServerMetaStatus } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import {
  Server as ServerIcon, Cpu, HardDrive, MemoryStick, Trash2,
  Activity, Plus, X, Copy, Check, Edit2, Save, KeyRound, RefreshCw,
  Gauge, Search, CircleCheck, CircleX, CircleAlert, Download, Rss,
} from "lucide-react";
import { formatBytes } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

function getStatusColor(percent: number) {
  if (percent > 90) return "bg-destructive";
  if (percent > 75) return "bg-warning";
  return "bg-success";
}

function ServerDetailModal({
  serverId, serverName, serverHostname, onClose, canEdit,
}: {
  serverId: number; serverName: string; serverHostname: string; onClose: () => void; canEdit: boolean;
}) {
  const [hours, setHours] = useState(1);
  const { data: metrics, isLoading } = useGetServerMetrics(serverId, { hours }, {
    query: { refetchInterval: 30000 },
  });
  const { data: logSnapshots } = useGetServerLogSnapshots(serverId, { hours: Math.min(hours, 24) }, {
    query: { enabled: true, refetchInterval: 300000 },
  });
  const { data: metaStatus, isLoading: metaStatusLoading } = useGetServerMetaStatus(serverId, { hours: Math.min(hours, 24) }, {
    query: {
      queryKey: [`/api/servers/${serverId}/meta-status`, { hours: Math.min(hours, 24) }],
      enabled: true,
      refetchInterval: 300000,
    },
  });
  const updateServer = useUpdateServer();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const regenerateKey = useRegenerateServerKey();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(serverName);
  const [editHostname, setEditHostname] = useState(serverHostname);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [showCollectedLogs, setShowCollectedLogs] = useState(false);
  const [downloadingFormat, setDownloadingFormat] = useState<"json" | "csv" | "pdf" | null>(null);

  const handleSaveEdit = async () => {
    try {
      await updateServer.mutateAsync({ serverId, data: { name: editName.trim(), hostname: editHostname.trim() } });
      queryClient.invalidateQueries({ queryKey: ["/api/servers"] });
      setEditing(false);
      toast({ title: "Updated", description: "Server details saved." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleRegenerateKey = async () => {
    if (!confirm("Regenerate API key? The current agent on this server will stop authenticating until you update its .env file with the new key.")) return;
    try {
      const result = await regenerateKey.mutateAsync({ serverId });
      setNewApiKey((result as any).apiKey);
      toast({ title: "Key Regenerated", description: "Copy the new key and update the agent on this server." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const copyKey = () => {
    if (newApiKey) {
      navigator.clipboard.writeText(newApiKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  const downloadLogs = async (format: "json" | "csv" | "pdf") => {
    setDownloadingFormat(format);
    try {
      const blob = await customFetch<Blob>(
        `/api/servers/${serverId}/log-snapshots/export?hours=${Math.min(hours, 24)}&format=${format}`,
        { responseType: "blob" },
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${serverName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || `server-${serverId}`}-logs-${hours}h.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast({
        title: "Download ready",
        description: format === "pdf" ? "Management PDF report downloaded." : `${format.toUpperCase()} log export downloaded.`,
      });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Download failed", description: e.message || "Could not export server logs." });
    } finally {
      setDownloadingFormat(null);
    }
  };

  const cpuData = (metrics ?? []).map((m: any) => ({
    time: new Date(m.recordedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    cpu: m.cpuPercent,
    mem: m.memTotalBytes > 0 ? (m.memUsedBytes / m.memTotalBytes) * 100 : 0,
    disk: m.diskTotalBytes > 0 ? (m.diskUsedBytes / m.diskTotalBytes) * 100 : 0,
    connections: m.connectionCount || 0,
    httpConnections: m.httpConnectionCount || 0,
    processes: m.processCount || 0,
    phpActive: m.phpFpm?.active || 0,
    phpTotal: m.phpFpm?.total || 0,
  }));

  const latest = metrics && metrics.length > 0 ? metrics[metrics.length - 1] : null;
  const latestProcesses: any[] = (latest as any)?.topProcesses || [];
  const varnishData = (metrics ?? [])
    .filter((m: any) => m.varnish)
    .map((m: any) => ({
      time: new Date(m.recordedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      hitRate: m.varnish?.hitRate ?? null,
      hits: m.varnish?.cacheHits ?? 0,
      misses: m.varnish?.cacheMisses ?? 0,
      requests: m.varnish?.clientRequests ?? 0,
    }));
  const openSearchData = (metrics ?? [])
    .filter((m: any) => m.elasticsearch)
    .map((m: any) => ({
      time: new Date(m.recordedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      nodes: m.elasticsearch?.numberOfNodes ?? 0,
      dataNodes: m.elasticsearch?.numberOfDataNodes ?? 0,
      shards: m.elasticsearch?.activeShards ?? 0,
      status: m.elasticsearch?.status ?? null,
    }));
  const latestVarnish = (latest as any)?.varnish;
  const latestOpenSearch = (latest as any)?.elasticsearch;
  const openSearchStatus = latestOpenSearch?.status;
  const serviceStatus = (running: boolean | undefined, label: string) => {
    if (running === true) {
      return <span className="inline-flex items-center gap-1 text-xs font-medium text-success"><CircleCheck className="w-3.5 h-3.5" /> {label}</span>;
    }
    if (running === false) {
      return <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive"><CircleX className="w-3.5 h-3.5" /> Unavailable</span>;
    }
    return <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground"><CircleAlert className="w-3.5 h-3.5" /> No data</span>;
  };
  const metaStatusMeta = {
    healthy: { label: "Healthy", icon: CircleCheck, className: "text-success", badge: "success" as const },
    warning: { label: "Warning", icon: CircleAlert, className: "text-warning", badge: "warning" as const },
    error: { label: "Errors found", icon: CircleX, className: "text-destructive", badge: "destructive" as const },
    unknown: { label: "No feed data", icon: CircleAlert, className: "text-muted-foreground", badge: "outline" as const },
  } as const;
  const metaView = metaStatusMeta[metaStatus?.status ?? "unknown"];
  const MetaStatusIcon = metaView.icon;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card text-card-foreground rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-card z-10">
          {editing ? (
            <div className="flex-1 flex items-center gap-3 mr-4">
              <div className="flex-1 space-y-2">
                <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Server name" className="font-semibold" />
                <Input value={editHostname} onChange={e => setEditHostname(e.target.value)} placeholder="Hostname" className="text-sm font-mono" />
              </div>
              <Button size="sm" onClick={handleSaveEdit} disabled={updateServer.isPending} className="gap-1">
                <Save className="w-4 h-4" /> Save
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setEditing(false); setEditName(serverName); setEditHostname(serverHostname); }}>
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold font-display">{editName !== serverName ? editName : serverName}</h2>
              {canEdit && (
                <button onClick={() => setEditing(true)} className="p-1.5 hover:bg-secondary rounded-lg text-muted-foreground hover:text-foreground">
                  <Edit2 className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
          <button onClick={onClose} className="p-2 hover:bg-secondary rounded-full shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {newApiKey && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm">
                <KeyRound className="w-4 h-4" /> New API Key (copy it now — it won't be shown again)
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-white border rounded px-3 py-2 font-mono text-sm break-all">{newApiKey}</code>
                <Button size="sm" variant="outline" onClick={copyKey} className="shrink-0 gap-1">
                  {copiedKey ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  {copiedKey ? "Copied" : "Copy"}
                </Button>
              </div>
              <p className="text-xs text-amber-700">Update <code>/opt/monitor-agent/.env</code> on this server with the new key, then restart: <code>sudo systemctl restart monitor-agent</code></p>
            </div>
          )}

          {canEdit && !editing && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleRegenerateKey} disabled={regenerateKey.isPending} className="gap-1.5 text-amber-700 border-amber-300 hover:bg-amber-50">
                <RefreshCw className={`w-4 h-4 ${regenerateKey.isPending ? "animate-spin" : ""}`} /> Regenerate API Key
              </Button>
            </div>
          )}

          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-500/10 p-2 text-blue-600">
                  <Rss className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold">Meta / Facebook feed</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Feed activity and errors from sanitized server logs
                  </p>
                </div>
              </div>
              <Badge variant={metaView.badge} className="gap-1">
                <MetaStatusIcon className={`w-3.5 h-3.5 ${metaView.className}`} />
                {metaStatusLoading ? "Checking…" : metaView.label}
              </Badge>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              <div className="bg-secondary/50 rounded-lg p-3 border">
                <p className="text-xs text-muted-foreground">Successful activity</p>
                <p className="text-lg font-bold">{metaStatus?.successCount ?? "—"}</p>
              </div>
              <div className="bg-secondary/50 rounded-lg p-3 border">
                <p className="text-xs text-muted-foreground">Errors</p>
                <p className="text-lg font-bold text-destructive">{metaStatus?.errorCount ?? "—"}</p>
              </div>
              <div className="bg-secondary/50 rounded-lg p-3 border">
                <p className="text-xs text-muted-foreground">Warnings</p>
                <p className="text-lg font-bold text-warning">{metaStatus?.warningCount ?? "—"}</p>
              </div>
              <div className="bg-secondary/50 rounded-lg p-3 border">
                <p className="text-xs text-muted-foreground">Window</p>
                <p className="text-lg font-bold">{Math.min(hours, 24)}h</p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground mt-4">
              {metaStatus?.message ?? "Checking recent Meta feed activity…"}
            </p>
            {metaStatus?.lastEventAt && (
              <p className="text-xs text-muted-foreground mt-1">
                Last detected activity: {new Date(metaStatus.lastEventAt).toLocaleString()}
              </p>
            )}
            {metaStatus?.recentErrors?.length ? (
              <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                <p className="text-xs font-semibold text-destructive mb-2">Recent feed errors</p>
                <ul className="space-y-1.5">
                  {metaStatus.recentErrors.slice(0, 3).map((event, index) => (
                    <li key={`${event.recordedAt}-${index}`} className="text-xs text-muted-foreground">
                      <span className="font-mono text-[10px] mr-2">{new Date(event.recordedAt).toLocaleTimeString()}</span>
                      <span className="break-all">{event.line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">Collected performance logs</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Sanitized snapshots from the last {hours}h, including Magento, system, Stripe, and Meta/Facebook sources. Secrets and payment credentials are redacted.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowCollectedLogs(value => !value)}
                  disabled={!logSnapshots?.length}
                >
                  {showCollectedLogs ? "Hide logs" : `View logs (${logSnapshots?.length ?? 0})`}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => downloadLogs("json")}
                  disabled={downloadingFormat !== null}
                  className="gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  {downloadingFormat === "json" ? "Preparing…" : "JSON"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => downloadLogs("csv")}
                  disabled={downloadingFormat !== null}
                  className="gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  {downloadingFormat === "csv" ? "Preparing…" : "CSV"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => downloadLogs("pdf")}
                  disabled={downloadingFormat !== null}
                  className="gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  {downloadingFormat === "pdf" ? "Preparing…" : "PDF report"}
                </Button>
              </div>
            </div>
            {showCollectedLogs && logSnapshots && logSnapshots.length > 0 && (
              <div className="mt-4 space-y-3">
                {logSnapshots.slice(-3).reverse().map((snapshot: any) => (
                  <div key={snapshot.id} className="rounded-lg border border-border bg-card p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Snapshot {new Date(snapshot.recordedAt).toLocaleString()}
                    </p>
                    <div className="space-y-3">
                      {Object.entries(snapshot.logs?.sources ?? {}).filter(([, value]) => value).map(([source, value]) => (
                        <div key={source}>
                          <p className="text-xs font-semibold capitalize mb-1">
                            {source === "stripe" ? "Stripe payments" : source === "meta" ? "Meta / Facebook feed" : source}
                          </p>
                          <pre className="max-h-48 overflow-auto rounded bg-black/90 text-green-200 p-3 text-[10px] leading-4 whitespace-pre-wrap break-all">
                            {String(value)}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Activity className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {latest && (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Load (1m)", value: (latest as any).loadAvg1m?.toFixed(2) },
                    { label: "Load (5m)", value: (latest as any).loadAvg5m?.toFixed(2) },
                    { label: "Load (15m)", value: (latest as any).loadAvg15m?.toFixed(2) },
                    { label: "Memory", value: `${formatBytes((latest as any).memUsedBytes)} / ${formatBytes((latest as any).memTotalBytes)}` },
                    { label: "Disk", value: `${formatBytes((latest as any).diskUsedBytes)} / ${formatBytes((latest as any).diskTotalBytes)}` },
                    { label: "Network", value: `${formatBytes((latest as any).netRxBytes)} rx / ${formatBytes((latest as any).netTxBytes)} tx` },
                    ...((latest as any).connectionCount != null ? [
                      { label: "Connections", value: `${(latest as any).connectionCount} total / ${(latest as any).httpConnectionCount || 0} HTTP` },
                    ] : []),
                    ...((latest as any).processCount != null ? [
                      { label: "Processes", value: String((latest as any).processCount) },
                    ] : []),
                    ...((latest as any).phpFpm?.total > 0 ? [
                      { label: "PHP-FPM Workers", value: `${(latest as any).phpFpm.active} active / ${(latest as any).phpFpm.total} total` },
                    ] : []),
                  ].map(s => (
                    <div key={s.label} className="bg-secondary/50 rounded-xl p-3 border">
                      <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
                      <p className="text-sm font-semibold">{s.value}</p>
                    </div>
                  ))}
                </div>
              )}

              {latest && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-border bg-muted/30 p-4">
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="flex items-center gap-2">
                        <div className="rounded-lg bg-amber-500/10 p-2 text-amber-600">
                          <Gauge className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-semibold">Varnish Cache</h3>
                          <p className="text-xs text-muted-foreground">Cache performance and requests</p>
                        </div>
                      </div>
                      {serviceStatus(latestVarnish?.isRunning, latestVarnish?.isRunning ? "Running" : "Varnish")}
                    </div>
                    {latestVarnish ? (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-xs text-muted-foreground">Hit rate</p>
                            <p className="text-xl font-bold">{latestVarnish.hitRate != null ? `${latestVarnish.hitRate}%` : "—"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Client requests</p>
                            <p className="text-xl font-bold">{latestVarnish.clientRequests?.toLocaleString() ?? "—"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Cache hits</p>
                            <p className="font-semibold">{latestVarnish.cacheHits?.toLocaleString() ?? "—"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Cache misses</p>
                            <p className="font-semibold">{latestVarnish.cacheMisses?.toLocaleString() ?? "—"}</p>
                          </div>
                        </div>
                        {latestVarnish.isRunning && latestVarnish.hitRate == null && (
                          <p className="text-xs text-muted-foreground mt-3">Varnish is running, but varnishstat did not return cache counters.</p>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">No Varnish telemetry has been reported yet.</p>
                    )}
                  </div>

                  <div className="rounded-xl border border-border bg-muted/30 p-4">
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="flex items-center gap-2">
                        <div className="rounded-lg bg-cyan-500/10 p-2 text-cyan-600">
                          <Search className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-semibold">OpenSearch</h3>
                          <p className="text-xs text-muted-foreground">Cluster health and shard status</p>
                        </div>
                      </div>
                      {serviceStatus(
                        latestOpenSearch?.isRunning,
                        openSearchStatus ? openSearchStatus[0].toUpperCase() + openSearchStatus.slice(1) : "OpenSearch"
                      )}
                    </div>
                    {latestOpenSearch ? (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-xs text-muted-foreground">Cluster status</p>
                            <p className={`text-xl font-bold ${openSearchStatus === "red" ? "text-destructive" : openSearchStatus === "yellow" ? "text-warning" : ""}`}>
                              {openSearchStatus ? openSearchStatus[0].toUpperCase() + openSearchStatus.slice(1) : "—"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Nodes</p>
                            <p className="text-xl font-bold">{latestOpenSearch.numberOfNodes ?? "—"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Data nodes</p>
                            <p className="font-semibold">{latestOpenSearch.numberOfDataNodes ?? "—"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Active shards</p>
                            <p className="font-semibold">{latestOpenSearch.activeShards ?? "—"}</p>
                          </div>
                        </div>
                        {latestOpenSearch.error && (
                          <p className="text-xs text-destructive mt-3">{latestOpenSearch.error}</p>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">No OpenSearch telemetry has been reported yet.</p>
                    )}
                  </div>

                </div>
              )}

              {cpuData.length > 0 ? (
                <>
                  {["cpu", "mem", "disk"].map(metric => (
                    <div key={metric} className="bg-secondary/30 rounded-xl p-4 border">
                      <p className="text-sm font-semibold mb-3 capitalize">{metric === "mem" ? "Memory" : metric === "cpu" ? "CPU" : "Disk"} Usage (%)</p>
                      <div className="h-[120px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={cpuData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 2px 10px rgba(0,0,0,0.1)" }} />
                            <Line type="monotone" dataKey={metric} stroke={metric === "cpu" ? "#3b82f6" : metric === "mem" ? "#8b5cf6" : "#f59e0b"} strokeWidth={2} dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  ))}

                  {cpuData.some(d => d.connections > 0 || d.phpActive > 0) && (
                    <>
                      <div className="bg-secondary/30 rounded-xl p-4 border">
                        <p className="text-sm font-semibold mb-3">Connections</p>
                        <div className="h-[120px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={cpuData}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                              <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                              <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                              <Tooltip contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 2px 10px rgba(0,0,0,0.1)" }} />
                              <Line type="monotone" dataKey="connections" name="Total" stroke="#10b981" strokeWidth={2} dot={false} />
                              <Line type="monotone" dataKey="httpConnections" name="HTTP" stroke="#06b6d4" strokeWidth={2} dot={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {cpuData.some(d => d.phpActive > 0) && (
                        <div className="bg-secondary/30 rounded-xl p-4 border">
                          <p className="text-sm font-semibold mb-3">PHP-FPM Workers</p>
                          <div className="h-[120px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={cpuData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                                <Tooltip contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 2px 10px rgba(0,0,0,0.1)" }} />
                                <Line type="monotone" dataKey="phpActive" name="Active" stroke="#ef4444" strokeWidth={2} dot={false} />
                                <Line type="monotone" dataKey="phpTotal" name="Total" stroke="#94a3b8" strokeWidth={2} dot={false} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {(varnishData.length > 0 || openSearchData.length > 0) && (
                    <div className="space-y-4">
                      {varnishData.length > 0 && (
                        <div className="bg-muted/30 rounded-xl p-4 border border-border">
                          <div className="flex items-center gap-2 mb-3">
                            <Gauge className="w-4 h-4 text-amber-600" />
                            <p className="text-sm font-semibold">Varnish Hit Rate</p>
                          </div>
                          <div className="h-[150px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={varnishData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} unit="%" />
                                <Tooltip contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 2px 10px rgba(0,0,0,0.1)" }} />
                                <Line type="monotone" dataKey="hitRate" name="Hit rate" stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      )}

                      {openSearchData.length > 0 && (
                        <div className="bg-muted/30 rounded-xl p-4 border border-border">
                          <div className="flex items-center gap-2 mb-3">
                            <Search className="w-4 h-4 text-cyan-600" />
                            <p className="text-sm font-semibold">OpenSearch Cluster</p>
                          </div>
                          <div className="h-[150px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={openSearchData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                                <Tooltip contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 2px 10px rgba(0,0,0,0.1)" }} />
                                <Line type="monotone" dataKey="nodes" name="Nodes" stroke="#06b6d4" strokeWidth={2} dot={false} />
                                <Line type="monotone" dataKey="shards" name="Active shards" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {latestProcesses.length > 0 && (
                    <div className="bg-secondary/30 rounded-xl p-4 border">
                      <p className="text-sm font-semibold mb-3">Top Processes (by CPU)</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b text-left text-muted-foreground">
                              <th className="pb-2 pr-3">PID</th>
                              <th className="pb-2 pr-3">User</th>
                              <th className="pb-2 pr-3 text-right">CPU%</th>
                              <th className="pb-2 pr-3 text-right">MEM%</th>
                              <th className="pb-2 pr-3 text-right">RSS</th>
                              <th className="pb-2">Command</th>
                            </tr>
                          </thead>
                          <tbody>
                            {latestProcesses.map((p: any, i: number) => (
                              <tr key={i} className={`border-b border-secondary ${p.cpu > 50 ? "bg-red-50" : p.cpu > 20 ? "bg-amber-50" : ""}`}>
                                <td className="py-1.5 pr-3 font-mono">{p.pid}</td>
                                <td className="py-1.5 pr-3">{p.user}</td>
                                <td className="py-1.5 pr-3 text-right font-semibold">{p.cpu?.toFixed(1)}</td>
                                <td className="py-1.5 pr-3 text-right">{p.mem?.toFixed(1)}</td>
                                <td className="py-1.5 pr-3 text-right">{formatBytes(p.rss || 0)}</td>
                                <td className="py-1.5 font-mono text-[10px] truncate max-w-[200px]" title={p.command}>{p.command}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Activity className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p className="font-medium">No metrics data yet</p>
                  <p className="text-sm mt-1">Install the agent on this server to start collecting data</p>
                </div>
              )}

              <div className="flex justify-center gap-2">
                {[1, 6, 24].map(h => (
                  <button
                    key={h}
                    onClick={() => setHours(h)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      hours === h ? "bg-primary text-white" : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                    }`}
                  >
                    {h}h
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Servers() {
  const { data: servers, refetch } = useListServers({ query: { refetchInterval: 30000 } });
  const createServer = useCreateServer();
  const deleteMutation = useDeleteServer();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newHostname, setNewHostname] = useState("");
  const [showApiKey, setShowApiKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [selectedServer, setSelectedServer] = useState<{ id: number; name: string; hostname: string } | null>(null);

  const canEdit = user?.role === "admin" || user?.role === "editor";
  const installerApiUrl = typeof window !== "undefined" ? window.location.origin : "";

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
      toast({ title: "Server added", description: "Copy the API key below to install the agent." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleDelete = (id: number, name: string) => {
    if (!confirm(`Delete server "${name}"? All metrics data will be lost.`)) return;
    deleteMutation.mutate({ serverId: id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/servers"] });
        toast({ title: "Deleted", description: `${name} has been removed.` });
      },
    });
  };

  const copyApiKey = () => {
    if (showApiKey) {
      navigator.clipboard.writeText(showApiKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-display font-bold">Servers</h1>
          <p className="text-muted-foreground mt-1">
            {servers?.length ?? 0} servers monitored
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setShowAdd(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Add Server
          </Button>
        )}
      </div>

      {showAdd && (
        <Card className="border-primary/20">
          <CardContent className="p-4 space-y-3">
            <p className="font-semibold text-sm">New Server</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Server name (e.g. IE Production)" />
              <Input value={newHostname} onChange={e => setNewHostname(e.target.value)} placeholder="Hostname (e.g. ec2-xx.compute.amazonaws.com)" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAdd} disabled={createServer.isPending}>Add Server</Button>
              <Button size="sm" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {showApiKey && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4 space-y-3">
            <p className="font-semibold text-green-800">Server Added!</p>
            <p className="text-sm text-green-700">Install the agent on your server with this API key:</p>
            <div className="flex items-center gap-2 bg-white rounded-lg p-3 border font-mono text-sm">
              <code className="flex-1 break-all select-all">{showApiKey}</code>
              <button onClick={copyApiKey} className="p-2 hover:bg-secondary rounded-lg shrink-0">
                {copiedKey ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-green-700">
              Copy this key now — you won't see it again. Install with the command below:
            </p>
            <code className="block bg-white px-3 py-2 rounded border text-xs break-all select-all">
              curl -sL {installerApiUrl}/api/agent/install | sudo bash -s -- {installerApiUrl} {showApiKey}
            </code>
            <p className="text-xs text-muted-foreground">
              The installer checks the configured Amazon OpenSearch domain in IAM mode. The EC2 instance needs network access to the VPC endpoint and an IAM role allowed to query the domain.
            </p>
            <Button size="sm" variant="outline" onClick={() => { setShowApiKey(null); setCopiedKey(false); }}>Got it</Button>
          </CardContent>
        </Card>
      )}

      {(!servers || servers.length === 0) ? (
        <div className="text-center py-20 text-muted-foreground">
          <ServerIcon className="w-12 h-12 mx-auto mb-4 opacity-40" />
          <h3 className="text-lg font-semibold text-foreground mb-1">No Servers</h3>
          <p className="text-sm">Add a server and install the monitoring agent to start tracking CPU, memory, disk, and network usage.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {servers.map(server => {
            const m = server.latestMetrics;
            const memPercent = m ? (m.memUsedBytes / m.memTotalBytes) * 100 : 0;
            const diskPercent = m ? (m.diskUsedBytes / m.diskTotalBytes) * 100 : 0;
            const isOnline = server.lastSeenAt && (Date.now() - new Date(server.lastSeenAt).getTime()) < 120000;

            return (
              <Card
                key={server.id}
                className="overflow-hidden hover:shadow-lg transition-all duration-300 border-border/50 group relative cursor-pointer"
                onClick={() => setSelectedServer({ id: server.id, name: server.name, hostname: server.hostname })}
              >
                {canEdit && (
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(server.id, server.name); }}
                    className="absolute top-4 right-4 p-2 text-muted-foreground hover:bg-destructive hover:text-white rounded-full transition-colors opacity-0 group-hover:opacity-100 z-10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}

                <div className={`h-2 w-full ${isOnline ? "bg-success" : "bg-destructive"}`} />

                <CardContent className="p-6">
                  <div className="flex items-start gap-4 mb-6">
                    <div className="bg-secondary p-3 rounded-xl">
                      <ServerIcon className="w-8 h-8 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold font-display">{server.name}</h3>
                      <p className="text-sm text-muted-foreground font-mono mt-0.5">{server.hostname}</p>
                    </div>
                    <div className="ml-auto mt-1">
                      <Badge variant={isOnline ? "success" : "destructive"}>
                        {isOnline ? "Online" : "Offline"}
                      </Badge>
                    </div>
                  </div>

                  {m ? (
                    <div className="space-y-5">
                      <div>
                        <div className="flex justify-between text-sm mb-1.5">
                          <span className="flex items-center gap-1.5 font-medium"><Cpu className="w-4 h-4 text-muted-foreground" /> CPU Usage</span>
                          <span className="font-mono">{m.cpuPercent.toFixed(1)}%</span>
                        </div>
                        <Progress value={m.cpuPercent} indicatorColor={getStatusColor(m.cpuPercent)} className="h-2.5 bg-secondary" />
                      </div>

                      <div>
                        <div className="flex justify-between text-sm mb-1.5">
                          <span className="flex items-center gap-1.5 font-medium"><MemoryStick className="w-4 h-4 text-muted-foreground" /> Memory</span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {formatBytes(m.memUsedBytes)} / {formatBytes(m.memTotalBytes)}
                          </span>
                        </div>
                        <Progress value={memPercent} indicatorColor={getStatusColor(memPercent)} className="h-2.5 bg-secondary" />
                      </div>

                      <div>
                        <div className="flex justify-between text-sm mb-1.5">
                          <span className="flex items-center gap-1.5 font-medium"><HardDrive className="w-4 h-4 text-muted-foreground" /> Disk Space</span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {formatBytes(m.diskUsedBytes)} / {formatBytes(m.diskTotalBytes)}
                          </span>
                        </div>
                        <Progress value={diskPercent} indicatorColor={getStatusColor(diskPercent)} className="h-2.5 bg-secondary" />
                      </div>

                      <div className="grid grid-cols-2 gap-4 pt-4 border-t mt-4">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Load Average</p>
                          <p className="font-mono text-sm">{m.loadAvg1m.toFixed(2)} / {m.loadAvg5m.toFixed(2)} / {m.loadAvg15m.toFixed(2)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground mb-1">Last Updated</p>
                          <p className="text-sm">{formatDistanceToNow(new Date(m.recordedAt), { addSuffix: true })}</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="py-8 text-center bg-slate-50 rounded-xl border border-dashed">
                      <Activity className="w-8 h-8 mx-auto text-muted-foreground mb-2 opacity-50" />
                      <p className="text-sm text-muted-foreground">Waiting for initial telemetry...</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {selectedServer && (
        <ServerDetailModal
          serverId={selectedServer.id}
          serverName={selectedServer.name}
          serverHostname={selectedServer.hostname}
          onClose={() => setSelectedServer(null)}
          canEdit={canEdit}
        />
      )}
    </div>
  );
}
