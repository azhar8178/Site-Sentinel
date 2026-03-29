import { useState } from "react";
import { useListServers, useCreateServer, useDeleteServer, useUpdateServer, useRegenerateServerKey, useGetServerMetrics } from "@workspace/api-client-react";
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
  const updateServer = useUpdateServer();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const regenerateKey = useRegenerateServerKey();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(serverName);
  const [editHostname, setEditHostname] = useState(serverHostname);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

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

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white z-10">
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
              Copy this key now — you won't see it again. Install: <code className="bg-white px-1 rounded">curl -sL https://your-domain/agent/install.sh | sudo bash -s -- https://your-domain API_KEY</code>
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
