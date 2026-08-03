import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity, Clock, Globe, RefreshCw, AlertTriangle, CheckCircle2,
  Server, Shield, Cpu, Wifi, Lock,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { motion } from "framer-motion";

async function apiFetch<T>(url: string): Promise<T> {
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
  const token = localStorage.getItem("sentinel_token");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${base}${url}`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

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
      elasticsearch: { isRunning: boolean; status: string | null; error?: string } | null;
      sslExpiry: { domain: string; expiresAt?: string; daysRemaining: number; isExpired: boolean; isExpiringSoon: boolean }[] | null;
    } | null;
  }[];
}

function MiniBar({ value, warn = 80, danger = 90 }: { value: number | null; warn?: number; danger?: number }) {
  if (value === null) return <span className="text-muted-foreground/50">—</span>;
  const color = value >= danger ? "bg-red-500" : value >= warn ? "bg-amber-400" : "bg-emerald-500";
  const text = value >= danger ? "text-red-600" : value >= warn ? "text-amber-600" : "text-gray-700";
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className={`text-xs font-mono font-semibold w-8 text-right ${text}`}>{value}%</span>
    </div>
  );
}

function ServiceDot({ ok, label, detail }: { ok: boolean | null; label: string; detail?: string }) {
  const dot = ok === null ? "bg-gray-300" : ok ? "bg-emerald-500" : "bg-red-500";
  const text = ok === null ? "text-muted-foreground" : ok ? "text-foreground" : "text-red-700";
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${text}`} title={detail || label}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      {label}
    </span>
  );
}

export default function Dashboard() {
  const { data, isLoading, refetch, isFetching, dataUpdatedAt } = useQuery<HealthReport>({
    queryKey: ["/api/health-report"],
    queryFn: () => apiFetch<HealthReport>("/api/health-report"),
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  const report = data!;
  const isOperational = report.overallStatus === "operational";

  const sitesUp = report.sites.filter(s => s.currentStatus === "up").length;
  const sitesTotal = report.sites.length;

  const serversOnline = report.servers.filter(s => s.isOnline).length;
  const serversTotal = report.servers.length;

  const allSslEntries = report.servers.flatMap(s => s.services?.sslExpiry ?? []);
  const minSslDays = allSslEntries.length > 0 ? Math.min(...allSslEntries.map(e => e.daysRemaining)) : null;
  const hasExpiredSsl = allSslEntries.some(e => e.isExpired);
  const hasWarningSsl = allSslEntries.some(e => e.isExpiringSoon);

  const allServices = report.servers.flatMap(s => {
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

  const lastUpdated = dataUpdatedAt ? format(new Date(dataUpdatedAt), "HH:mm:ss") : null;

  const statusColor = isOperational ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-red-700 bg-red-50 border-red-200";
  const statusDot = isOperational ? "bg-emerald-500" : "bg-red-500";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {lastUpdated ? `Last updated ${lastUpdated}` : "Loading…"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`hidden sm:inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full border ${statusColor}`}>
            <span className={`w-2 h-2 rounded-full ${statusDot} ${isOperational ? "status-dot-up" : "status-dot-down"}`} />
            {isOperational ? "All Systems Operational" : "System Degraded"}
          </span>
          <Button onClick={() => refetch()} variant="outline" size="sm" className="gap-1.5" disabled={isFetching}>
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      {/* Compact stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            icon: <Globe className="w-4 h-4" />,
            label: "Sites",
            value: sitesTotal === 0 ? "—" : `${sitesUp} / ${sitesTotal}`,
            note: sitesUp === sitesTotal ? "All live" : `${sitesTotal - sitesUp} down`,
            ok: sitesUp === sitesTotal,
          },
          {
            icon: <Server className="w-4 h-4" />,
            label: "Servers",
            value: serversTotal === 0 ? "—" : `${serversOnline} / ${serversTotal}`,
            note: serversTotal === 0 ? "None added" : serversOnline === serversTotal ? "All online" : `${serversTotal - serversOnline} offline`,
            ok: serversTotal > 0 && serversOnline === serversTotal,
          },
          {
            icon: <Activity className="w-4 h-4" />,
            label: "Services",
            value: servicesTotal === 0 ? "—" : `${servicesOk} / ${servicesTotal}`,
            note: servicesTotal === 0 ? "No data yet" : servicesOk === servicesTotal ? "All healthy" : "Issue detected",
            ok: servicesTotal > 0 && servicesOk === servicesTotal,
          },
          {
            icon: <Lock className="w-4 h-4" />,
            label: "SSL",
            value: minSslDays !== null ? `${minSslDays}d` : "—",
            note: minSslDays !== null ? (hasExpiredSsl ? "Expired!" : hasWarningSsl ? "Expiring soon" : "All valid") : "Not tracked",
            ok: minSslDays !== null && !hasExpiredSsl && !hasWarningSsl,
          },
        ].map(stat => (
          <Card key={stat.label} className="shadow-none border">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg shrink-0 ${stat.ok ? "bg-emerald-50 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
                {stat.icon}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="text-lg font-bold font-mono leading-tight">{stat.value}</p>
                <p className={`text-xs truncate ${stat.ok ? "text-emerald-600" : "text-muted-foreground"}`}>{stat.note}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main grid: Sites (left) + Servers (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* Sites table */}
        {report.sites.length > 0 && (
          <Card className="lg:col-span-2 shadow-none border">
            <CardHeader className="pb-3 pt-5 px-5">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Globe className="w-4 h-4 text-muted-foreground" /> Store Availability
              </CardTitle>
            </CardHeader>
            <div className="divide-y divide-border">
              {report.sites.map(site => {
                const isUp = site.currentStatus === "up";
                const isSlow = site.currentStatus === "slow";
                const statusBadge = isUp ? "success" : isSlow ? "warning" : "destructive";
                return (
                  <div key={site.id} className="px-5 py-3.5 flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${isUp ? "bg-emerald-500 status-dot-up" : isSlow ? "bg-amber-400" : "bg-red-500 status-dot-down"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{site.name}</p>
                      <a href={site.url} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:text-primary truncate block">
                        {site.url.replace(/^https?:\/\//, "")}
                      </a>
                    </div>
                    <div className="text-right shrink-0 space-y-0.5">
                      <Badge variant={statusBadge} className="text-xs">{site.currentStatus.toUpperCase()}</Badge>
                      <p className="text-xs text-muted-foreground">
                        {site.lastResponseTimeMs != null ? `${(site.lastResponseTimeMs / 1000).toFixed(2)}s` : "—"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            {report.sites.some(s => s.lastCheckedAt) && (
              <div className="px-5 py-2.5 border-t bg-muted/30 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                {report.sites[0].lastCheckedAt
                  ? `Checked ${formatDistanceToNow(new Date(report.sites[0].lastCheckedAt), { addSuffix: true })}`
                  : ""}
              </div>
            )}
          </Card>
        )}

        {/* Servers */}
        {report.servers.length > 0 ? (
          <div className="lg:col-span-3 space-y-4">
            {report.servers.map((server) => {
              const svc = server.services;
              const nginxOk = svc?.nginx != null ? svc.nginx.isRunning : null;
              const varnishOk = svc?.varnish != null ? svc.varnish.isRunning : null;
              const phpOk = svc?.phpFpm != null ? svc.phpFpm.total > 0 : null;
              const mysqlOk = svc?.mysql != null ? true : null;
              const esOk = svc?.elasticsearch != null
                ? svc.elasticsearch.isRunning && svc.elasticsearch.status !== "red"
                : null;

              return (
                <Card key={server.id} className="shadow-none border">
                  <CardContent className="p-5 space-y-4">

                    {/* Server name + status */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className={`p-1.5 rounded-md ${server.isOnline ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>
                          <Server className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm">{server.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{server.hostname}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant={server.isOnline ? "success" : "destructive"}>
                          {server.isOnline ? "Online" : "Offline"}
                        </Badge>
                        {server.lastSeenAt && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatDistanceToNow(new Date(server.lastSeenAt), { addSuffix: true })}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Vitals — compact inline grid */}
                    {server.metrics ? (
                      <div className="space-y-2">
                        {[
                          { label: "CPU", value: server.metrics.cpuPercent },
                          { label: "Memory", value: server.metrics.memPercent },
                          { label: "Disk", value: server.metrics.diskPercent },
                        ].filter(v => v.value !== null).map(v => (
                          <div key={v.label} className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground w-14 shrink-0">{v.label}</span>
                            <MiniBar value={v.value} />
                          </div>
                        ))}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
                          <span className="flex items-center gap-1">
                            <Cpu className="w-3 h-3" /> Load {server.metrics.loadAvg1m?.toFixed(2) ?? "—"}
                          </span>
                          {server.metrics.connectionCount != null && (
                            <span className="flex items-center gap-1">
                              <Wifi className="w-3 h-3" /> {server.metrics.connectionCount} conns
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {server.isOnline ? "Waiting for first metrics report…" : "No metrics — server offline"}
                      </p>
                    )}

                    {/* Services row */}
                    {svc && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1 border-t">
                        {svc.nginx !== null && <ServiceDot ok={nginxOk} label="Nginx" />}
                        {svc.varnish !== null && <ServiceDot ok={varnishOk} label="Varnish" />}
                        {svc.phpFpm !== null && <ServiceDot ok={phpOk} label="PHP-FPM" />}
                        {svc.mysql !== null && <ServiceDot ok={mysqlOk} label="MySQL" />}
                        {svc.elasticsearch !== null && (
                          <ServiceDot
                            ok={esOk}
                            label="OpenSearch"
                            detail={svc.elasticsearch.error}
                          />
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : report.sites.length === 0 ? null : (
          <div className="lg:col-span-3">
            <Card className="border-dashed shadow-none h-full flex items-center justify-center">
              <CardContent className="p-10 text-center">
                <Server className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
                <p className="font-semibold text-sm">No servers registered</p>
                <p className="text-xs text-muted-foreground mt-1">Add your EC2 instance in the Servers page.</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Empty state — no sites, no servers */}
        {report.sites.length === 0 && report.servers.length === 0 && (
          <div className="col-span-full">
            <Card className="border-dashed shadow-none">
              <CardContent className="p-12 text-center">
                <Activity className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="font-semibold">Nothing to monitor yet</p>
                <p className="text-sm text-muted-foreground mt-1">Add a site or server to start seeing data here.</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* SSL Certificates — only if data exists */}
      {allSslEntries.length > 0 && (
        <Card className="shadow-none border">
          <CardHeader className="pb-3 pt-5 px-5">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Shield className="w-4 h-4 text-muted-foreground" /> SSL Certificates
            </CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-t border-b bg-muted/30">
                <tr>
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground">Domain</th>
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground">Expires</th>
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground">Days Left</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {allSslEntries.map(e => {
                  const ok = !e.isExpired && !e.isExpiringSoon;
                  const dayColor = e.isExpired ? "text-red-600 font-semibold" : e.isExpiringSoon ? "text-amber-600 font-semibold" : "text-muted-foreground";
                  return (
                    <tr key={e.domain} className="hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3 font-mono text-xs">{e.domain}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-xs ${ok ? "text-emerald-700" : e.isExpiringSoon ? "text-amber-700" : "text-red-700"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-emerald-500" : e.isExpiringSoon ? "bg-amber-400" : "bg-red-500"}`} />
                          {e.isExpired ? "Expired" : e.isExpiringSoon ? "Expiring soon" : "Valid"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-muted-foreground">
                        {e.expiresAt ? new Date(e.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                      </td>
                      <td className={`px-5 py-3 text-xs font-mono ${dayColor}`}>
                        {e.isExpired ? "Expired" : `${e.daysRemaining}d`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

    </motion.div>
  );
}
