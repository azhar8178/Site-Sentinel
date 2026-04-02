import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
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
      elasticsearch: { isRunning: boolean; status: string | null } | null;
      sslExpiry: { domain: string; expiresAt?: string; daysRemaining: number; isExpired: boolean; isExpiringSoon: boolean }[] | null;
    } | null;
  }[];
}

function VitalBar({ value, label, warn = 80, danger = 90 }: { value: number | null; label: string; warn?: number; danger?: number }) {
  if (value === null) return null;
  const color = value >= danger ? "bg-red-500" : value >= warn ? "bg-amber-400" : "bg-emerald-500";
  const textColor = value >= danger ? "text-red-700" : value >= warn ? "text-amber-700" : "text-gray-600";
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-gray-500">{label}</span>
        <span className={`text-xs font-semibold font-mono ${textColor}`}>{value}%</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  );
}

function ServiceChip({ label, ok, detail }: { label: string; ok: boolean | null; detail?: string | null }) {
  const bg = ok === null ? "bg-gray-100 text-gray-500 border-gray-200"
    : ok ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : "bg-red-50 text-red-700 border-red-200";
  const dot = ok === null ? "bg-gray-400" : ok ? "bg-emerald-500" : "bg-red-500";
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${bg}`} title={detail ?? undefined}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function SslDaysChip({ days, isExpired, isExpiringSoon }: { days: number; isExpired: boolean; isExpiringSoon: boolean }) {
  const color = isExpired ? "bg-red-100 text-red-700 border-red-300"
    : isExpiringSoon ? "bg-amber-100 text-amber-700 border-amber-300"
    : "bg-emerald-50 text-emerald-700 border-emerald-200";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-mono font-semibold ${color}`}>
      {isExpired ? "Expired" : `${days}d`}
    </span>
  );
}

function KpiCard({ icon, label, value, sub, ok }: { icon: React.ReactNode; label: string; value: string; sub?: string; ok?: boolean }) {
  const iconBg = ok === false ? "bg-red-50 text-red-600" : ok === true ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600";
  return (
    <Card className="shadow-sm">
      <CardContent className="p-5 flex items-center gap-4">
        <div className={`p-2.5 rounded-xl ${iconBg}`}>{icon}</div>
        <div>
          <p className="text-xs text-muted-foreground font-medium">{label}</p>
          <p className="text-xl font-bold font-display text-foreground leading-tight">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
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
  const hasDownSite = sitesUp < sitesTotal;

  const serversOnline = report.servers.filter(s => s.isOnline).length;
  const serversTotal = report.servers.length;
  const hasOfflineServer = serversOnline < serversTotal;

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
    ].filter(v => v !== null);
  });
  const servicesOk = allServices.filter(v => v === true).length;
  const servicesTotal = allServices.length;
  const hasServiceDown = allServices.some(v => v === false);

  const lastUpdated = dataUpdatedAt ? format(new Date(dataUpdatedAt), "HH:mm:ss") : null;

  const ieSites = report.sites.filter(s => s.url.includes(".ie") || s.name.toLowerCase().includes(" ie"));
  const ukSites = report.sites.filter(s => s.url.includes(".co.uk") || s.name.toLowerCase().includes(" uk"));
  const otherSites = report.sites.filter(s => !ieSites.includes(s) && !ukSites.includes(s));

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Dashboard</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Live operational status · {lastUpdated ? `Updated ${lastUpdated}` : "Loading…"}
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline" className="gap-2 bg-white" disabled={isFetching}>
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* Overall Status Banner */}
      <Card className={`border-l-4 shadow-sm overflow-hidden ${!isOperational ? "border-l-destructive bg-destructive/5" : "border-l-success bg-success/5"}`}>
        <CardContent className="p-5 flex items-center gap-4">
          <div className={`p-3 rounded-full ${!isOperational ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"}`}>
            {!isOperational ? <AlertTriangle className="w-7 h-7" /> : <CheckCircle2 className="w-7 h-7" />}
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold font-display">
              {isOperational ? "All Systems Operational" : "System Degraded"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {isOperational
                ? "Monitoring is active. All sites and services are responding normally."
                : [
                    hasDownSite && `${sitesTotal - sitesUp} site(s) down`,
                    hasOfflineServer && `${serversTotal - serversOnline} server(s) offline`,
                    hasServiceDown && "service(s) unhealthy",
                  ].filter(Boolean).join(" · ")
              }
            </p>
          </div>
          <span className={`hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border ${isOperational ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}`}>
            <span className={`w-2 h-2 rounded-full ${isOperational ? "bg-emerald-500 status-dot-up" : "bg-red-500 status-dot-down"}`} />
            {isOperational ? "Operational" : "Degraded"}
          </span>
        </CardContent>
      </Card>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <KpiCard
            icon={<Globe className="w-5 h-5" />}
            label="Sites"
            value={`${sitesUp}/${sitesTotal}`}
            sub={sitesUp === sitesTotal ? "All live" : `${sitesTotal - sitesUp} down`}
            ok={!hasDownSite}
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <KpiCard
            icon={<Server className="w-5 h-5" />}
            label="Servers"
            value={serversTotal === 0 ? "—" : `${serversOnline}/${serversTotal}`}
            sub={serversTotal === 0 ? "No servers added" : serversOnline === serversTotal ? "All online" : `${serversTotal - serversOnline} offline`}
            ok={serversTotal === 0 ? undefined : !hasOfflineServer}
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <KpiCard
            icon={<Activity className="w-5 h-5" />}
            label="Services"
            value={servicesTotal === 0 ? "—" : `${servicesOk}/${servicesTotal}`}
            sub={servicesTotal === 0 ? "No data yet" : hasServiceDown ? "Issue detected" : "All healthy"}
            ok={servicesTotal === 0 ? undefined : !hasServiceDown}
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <KpiCard
            icon={<Lock className="w-5 h-5" />}
            label="SSL"
            value={minSslDays !== null ? `${minSslDays}d` : "—"}
            sub={minSslDays !== null ? (hasExpiredSsl ? "Certificate expired!" : hasWarningSsl ? "Expiring soon" : "All valid") : "No domains tracked"}
            ok={minSslDays !== null ? (!hasExpiredSsl && !hasWarningSsl) : undefined}
          />
        </motion.div>
      </div>

      {/* Sites Section */}
      {report.sites.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Globe className="w-4 h-4" /> Store Availability
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...ieSites, ...ukSites, ...otherSites].map((site, index) => {
              const isUp = site.currentStatus === "up";
              const isSlow = site.currentStatus === "slow";
              return (
                <motion.div
                  key={site.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 + index * 0.08 }}
                >
                  <Card className={`hover:shadow-md transition-all duration-200 border-l-4 ${isUp ? "border-l-success" : isSlow ? "border-l-warning" : "border-l-destructive"}`}>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-bold text-base font-display">{site.name}</h3>
                          <a
                            href={site.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-primary hover:underline"
                          >
                            {site.url.replace(/^https?:\/\//, "")}
                          </a>
                        </div>
                        <Badge variant={isUp ? "success" : isSlow ? "warning" : "destructive"} className="ml-2 shrink-0">
                          <div className="flex items-center gap-1.5">
                            <div className={`w-1.5 h-1.5 rounded-full ${isUp ? "bg-success status-dot-up" : isSlow ? "bg-warning" : "bg-destructive status-dot-down"}`} />
                            {site.currentStatus.toUpperCase()}
                          </div>
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Activity className="w-3 h-3" />
                          {site.lastResponseTimeMs != null
                            ? `${(site.lastResponseTimeMs / 1000).toFixed(2)}s`
                            : "—"}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {site.lastCheckedAt
                            ? formatDistanceToNow(new Date(site.lastCheckedAt), { addSuffix: true })
                            : "Never"}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </section>
      )}

      {/* Servers + Services Section */}
      {report.servers.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Server className="w-4 h-4" /> Infrastructure
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {report.servers.map((server, index) => {
              const svc = server.services;
              const nginxOk = svc?.nginx != null ? svc.nginx.isRunning : null;
              const varnishOk = svc?.varnish != null ? svc.varnish.isRunning : null;
              const phpOk = svc?.phpFpm != null ? svc.phpFpm.total > 0 : null;
              const mysqlOk = svc?.mysql != null ? true : null;
              const esOk = svc?.elasticsearch != null
                ? svc.elasticsearch.isRunning && svc.elasticsearch.status !== "red"
                : null;
              const hasServices = svc && (svc.nginx !== null || svc.varnish !== null || svc.phpFpm !== null || svc.mysql !== null || svc.elasticsearch !== null);

              return (
                <motion.div
                  key={server.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + index * 0.08 }}
                >
                  <Card className={`shadow-sm ${!server.isOnline ? "border-destructive/30 bg-destructive/5" : ""}`}>
                    <CardContent className="p-5 space-y-4">
                      {/* Server header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${server.isOnline ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>
                            <Server className="w-4 h-4" />
                          </div>
                          <div>
                            <h3 className="font-bold text-sm font-display">{server.name}</h3>
                            <p className="text-xs text-muted-foreground font-mono">{server.hostname}</p>
                          </div>
                        </div>
                        <Badge variant={server.isOnline ? "success" : "destructive"}>
                          <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${server.isOnline ? "bg-success status-dot-up" : "bg-destructive status-dot-down"}`} />
                          {server.isOnline ? "Online" : "Offline"}
                        </Badge>
                      </div>

                      {/* Vitals bars */}
                      {server.metrics ? (
                        <div className="space-y-2.5 py-2 px-3 bg-secondary/40 rounded-xl">
                          <VitalBar value={server.metrics.cpuPercent} label="CPU" />
                          <VitalBar value={server.metrics.memPercent} label="Memory" />
                          <VitalBar value={server.metrics.diskPercent} label="Disk" />
                          <div className="pt-1 flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Cpu className="w-3 h-3" />
                              Load {server.metrics.loadAvg1m?.toFixed(2) ?? "—"}
                            </span>
                            {server.metrics.connectionCount != null && (
                              <span className="flex items-center gap-1">
                                <Wifi className="w-3 h-3" />
                                {server.metrics.connectionCount} conns
                              </span>
                            )}
                            {server.lastSeenAt && (
                              <span className="flex items-center gap-1 ml-auto">
                                <Clock className="w-3 h-3" />
                                {formatDistanceToNow(new Date(server.lastSeenAt), { addSuffix: true })}
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="py-3 px-4 bg-secondary/40 rounded-xl text-xs text-muted-foreground">
                          {server.isOnline ? "No metrics received yet" : "Server offline — no metrics available"}
                        </div>
                      )}

                      {/* Services */}
                      {hasServices && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-2 font-medium">Services</p>
                          <div className="flex flex-wrap gap-1.5">
                            {svc?.nginx !== null && (
                              <ServiceChip
                                label="Nginx"
                                ok={nginxOk}
                                detail={svc?.nginx?.activeConnections != null ? `${svc.nginx.activeConnections} active connections` : undefined}
                              />
                            )}
                            {svc?.varnish !== null && (
                              <ServiceChip
                                label="Varnish"
                                ok={varnishOk}
                                detail={svc?.varnish?.hitRate != null ? `${svc.varnish.hitRate}% hit rate` : undefined}
                              />
                            )}
                            {svc?.phpFpm !== null && (
                              <ServiceChip
                                label="PHP-FPM"
                                ok={phpOk}
                                detail={svc?.phpFpm ? `${svc.phpFpm.active}/${svc.phpFpm.total} workers` : undefined}
                              />
                            )}
                            {svc?.mysql !== null && (
                              <ServiceChip
                                label="MySQL"
                                ok={mysqlOk}
                                detail={svc?.mysql ? `${svc.mysql.threads} threads` : undefined}
                              />
                            )}
                            {svc?.elasticsearch !== null && (
                              <ServiceChip
                                label="Elasticsearch"
                                ok={esOk}
                                detail={svc?.elasticsearch?.status ? `Cluster: ${svc.elasticsearch.status}` : undefined}
                              />
                            )}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </section>
      )}

      {/* SSL Certificates Section */}
      {allSslEntries.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Shield className="w-4 h-4" /> SSL Certificates
          </h2>
          <Card className="shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 border-b">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Domain</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Status</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Expires</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Days Left</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {allSslEntries.map(e => {
                  const ok = !e.isExpired && !e.isExpiringSoon;
                  return (
                    <tr key={e.domain} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-5 py-3.5 font-mono text-xs font-medium">{e.domain}</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${ok ? "text-emerald-700" : e.isExpiringSoon ? "text-amber-700" : "text-red-700"}`}>
                          <span className={`w-2 h-2 rounded-full ${ok ? "bg-emerald-500" : e.isExpiringSoon ? "bg-amber-400" : "bg-red-500"}`} />
                          {e.isExpired ? "Expired" : e.isExpiringSoon ? "Expiring soon" : "Valid"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-muted-foreground">
                        {e.expiresAt ? new Date(e.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                      </td>
                      <td className="px-5 py-3.5">
                        <SslDaysChip days={e.daysRemaining} isExpired={e.isExpired} isExpiringSoon={e.isExpiringSoon} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </section>
      )}

      {/* Empty state when no servers */}
      {report.servers.length === 0 && (
        <Card className="shadow-sm border-dashed">
          <CardContent className="p-10 text-center">
            <Server className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <h3 className="font-semibold text-foreground mb-1">No servers registered</h3>
            <p className="text-sm text-muted-foreground">
              Add your EC2 instance in the Servers page to see infrastructure metrics here.
            </p>
          </CardContent>
        </Card>
      )}

    </motion.div>
  );
}
