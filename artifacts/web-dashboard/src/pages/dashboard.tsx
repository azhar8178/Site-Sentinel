import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getGetServerMetricsQueryKey, useGetServerMetrics } from "@workspace/api-client-react";
import { format, formatDistanceToNow } from "date-fns";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Cpu,
  Database,
  Globe2,
  HardDrive,
  LockKeyhole,
  MemoryStick,
  RefreshCw,
  Server,
  ShieldCheck,
  Timer,
  Wifi,
  XCircle,
} from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
      sslExpiry: {
        domain: string;
        expiresAt?: string;
        daysRemaining: number;
        isExpired: boolean;
        isExpiringSoon: boolean;
      }[] | null;
    } | null;
  }[];
}

type MetricPoint = {
  recordedAt: string;
  cpuPercent: number;
  memUsedBytes: number;
  memTotalBytes: number;
  diskUsedBytes: number;
  diskTotalBytes: number;
  loadAvg1m: number;
  connectionCount?: number | null;
};

const CHART_COLORS = {
  cpu: "#1769aa",
  memory: "#b26a00",
  disk: "#087f5b",
  load: "#7c3aed",
  grid: "hsl(214 18% 87%)",
  tick: "hsl(215 16% 45%)",
};

async function apiFetch<T>(url: string): Promise<T> {
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
  const token = localStorage.getItem("sentinel_token");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${base}${url}`, { headers });
  if (!response.ok) throw new Error(`Unable to load monitoring data (HTTP ${response.status})`);
  return response.json();
}

function formatPercent(value: number | null | undefined) {
  return value == null ? "—" : `${Math.round(value)}%`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "No reading";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "No reading" : format(date, "dd MMM, HH:mm");
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function MetricBar({
  label,
  value,
  icon,
  warning = 80,
}: {
  label: string;
  value: number | null | undefined;
  icon: React.ReactNode;
  warning?: number;
}) {
  const tone = value == null ? "muted" : value >= 90 ? "danger" : value >= warning ? "warning" : "good";
  const toneClasses = {
    muted: "text-muted-foreground bg-muted",
    good: "text-emerald-700 bg-emerald-500",
    warning: "text-amber-700 bg-amber-500",
    danger: "text-red-700 bg-red-500",
  };

  return (
    <div className="space-y-1.5" data-testid={`metric-${label.toLowerCase()}`}>
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          {icon}
          {label}
        </span>
        <span className={`font-mono font-semibold ${toneClasses[tone].split(" ")[0]}`}>
          {formatPercent(value)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${toneClasses[tone].split(" ")[1]}`}
          style={{ width: `${Math.min(Math.max(value ?? 0, 0), 100)}%` }}
        />
      </div>
    </div>
  );
}

function StatusPill({ online, label }: { online: boolean | null; label: string }) {
  const Icon = online === null ? Clock3 : online ? CheckCircle2 : XCircle;
  const classes =
    online === null
      ? "border-border bg-muted text-muted-foreground"
      : online
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-red-200 bg-red-50 text-red-700";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold ${classes}`}
      data-testid={`status-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  );
}

function LoadingRows({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-label="Loading monitoring data" data-testid="loading-dashboard">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex animate-pulse items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-2/5 rounded bg-muted" />
            <div className="h-2.5 w-3/5 rounded bg-muted" />
          </div>
          <div className="h-5 w-16 rounded-full bg-muted" />
        </div>
      ))}
    </div>
  );
}

function ChartTooltipContent({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="mb-1.5 font-semibold text-foreground">{label}</p>
      {payload.map((item) => (
        <div key={item.name} className="flex items-center justify-between gap-5 py-0.5">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
            {item.name}
          </span>
          <span className="font-mono font-semibold text-foreground">
            {typeof item.value === "number" ? item.value.toFixed(1) : "—"}
            {item.name === "CPU" || item.name === "Memory" || item.name === "Disk" ? "%" : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

function ServerTrend({ server }: { server: HealthReport["servers"][number] }) {
  const [hours, setHours] = useState(24);
  const { data: metrics, isLoading, isError, refetch, isFetching } = useGetServerMetrics(server.id, { hours }, {
    query: { refetchInterval: 300000, queryKey: getGetServerMetricsQueryKey(server.id, { hours }) },
  });

  const chartData = useMemo(() => {
    return ((metrics ?? []) as MetricPoint[]).map((metric) => ({
      time: format(new Date(metric.recordedAt), hours <= 6 ? "HH:mm" : "dd MMM HH:mm"),
      CPU: Number(metric.cpuPercent.toFixed(1)),
      Memory:
        metric.memTotalBytes > 0
          ? Number(((metric.memUsedBytes / metric.memTotalBytes) * 100).toFixed(1))
          : null,
      Disk:
        metric.diskTotalBytes > 0
          ? Number(((metric.diskUsedBytes / metric.diskTotalBytes) * 100).toFixed(1))
          : null,
      Load: Number(metric.loadAvg1m.toFixed(2)),
    }));
  }, [hours, metrics]);

  return (
    <Card className="overflow-hidden border-border/80 shadow-none" data-testid={`card-server-trend-${server.id}`}>
      <CardHeader className="border-b border-border/70 bg-muted/20 px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Activity className="h-4 w-4 text-primary" aria-hidden="true" />
              {server.name}
              <span className="font-mono text-[11px] font-normal text-muted-foreground">{server.hostname}</span>
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              CPU, memory and disk utilization
              {metrics?.length ? ` · ${metrics.length} readings` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-border bg-card p-0.5" aria-label={`Time range for ${server.name}`}>
              {[1, 6, 24].map((range) => (
                <button
                  key={range}
                  type="button"
                  onClick={() => setHours(range)}
                  aria-pressed={hours === range}
                  data-testid={`button-trend-${server.id}-${range}h`}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    hours === range ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {range}h
                </button>
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => refetch()}
              disabled={isFetching}
              aria-label={`Refresh ${server.name} trend`}
              data-testid={`button-refresh-trend-${server.id}`}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} aria-hidden="true" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-5">
        {isLoading ? (
          <div className="flex h-[220px] items-end gap-2 px-2 pb-4 pt-6" aria-label="Loading chart">
            {[42, 68, 54, 82, 48, 72, 61, 88, 52, 75, 45, 64].map((height, index) => (
              <div key={index} className="flex-1 animate-pulse rounded-t bg-muted" style={{ height: `${height}%` }} />
            ))}
          </div>
        ) : isError ? (
          <div className="flex h-[220px] flex-col items-center justify-center rounded-lg border border-dashed border-red-200 bg-red-50/40 px-6 text-center" data-testid={`error-chart-${server.id}`}>
            <AlertTriangle className="mb-2 h-6 w-6 text-red-600" aria-hidden="true" />
            <p className="text-sm font-semibold text-red-800">Trend unavailable</p>
            <p className="mt-1 max-w-xs text-xs text-red-700/80">The metrics history could not be loaded for this server.</p>
            <Button type="button" variant="outline" size="sm" className="mt-3 border-red-200 bg-card" onClick={() => refetch()} data-testid={`button-retry-chart-${server.id}`}>
              Try again
            </Button>
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-[220px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-6 text-center" data-testid={`empty-chart-${server.id}`}>
            <Activity className="mb-2 h-6 w-6 text-muted-foreground/50" aria-hidden="true" />
            <p className="text-sm font-semibold">No history in this window</p>
            <p className="mt-1 max-w-xs text-xs text-muted-foreground">Metrics will appear after the monitoring agent reports its first reading.</p>
          </div>
        ) : (
          <div className="h-[220px] w-full" data-testid={`chart-server-${server.id}`}>
            <ResponsiveContainer width="100%" height="100%" debounce={0}>
              <LineChart data={chartData} margin={{ top: 6, right: 8, bottom: 0, left: -22 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_COLORS.grid} />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: CHART_COLORS.tick }} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis domain={[0, "auto"]} tick={{ fontSize: 10, fill: CHART_COLORS.tick }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltipContent />} cursor={{ stroke: CHART_COLORS.grid, strokeDasharray: "3 3" }} isAnimationActive={false} />
                <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "12px" }} iconType="circle" />
                <Line type="monotone" dataKey="CPU" stroke={CHART_COLORS.cpu} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                <Line type="monotone" dataKey="Memory" stroke={CHART_COLORS.memory} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                <Line type="monotone" dataKey="Disk" stroke={CHART_COLORS.disk} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                <Line type="monotone" dataKey="Load" stroke={CHART_COLORS.load} strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ServiceHealth({ servers }: { servers: HealthReport["servers"] }) {
  const services = servers.flatMap((server) => {
    const svc = server.services;
    if (!svc) return [];
    return [
      svc.nginx && { server: server.name, label: "Nginx", healthy: svc.nginx.isRunning, detail: svc.nginx.activeConnections != null ? `${svc.nginx.activeConnections} active connections` : "Web server" },
      svc.varnish && { server: server.name, label: "Varnish", healthy: svc.varnish.isRunning, detail: svc.varnish.hitRate != null ? `${svc.varnish.hitRate}% cache hit rate` : "Cache layer" },
      svc.phpFpm && { server: server.name, label: "PHP-FPM", healthy: svc.phpFpm.total > 0, detail: `${svc.phpFpm.active} active / ${svc.phpFpm.total} workers` },
      svc.mysql && { server: server.name, label: "MySQL", healthy: true, detail: `${svc.mysql.threads} threads · ${svc.mysql.slowQueries} slow queries` },
      svc.elasticsearch && { server: server.name, label: "OpenSearch", healthy: svc.elasticsearch.isRunning && svc.elasticsearch.status !== "red", detail: svc.elasticsearch.status ? `Cluster ${svc.elasticsearch.status}` : svc.elasticsearch.error || "Search cluster" },
    ].filter(Boolean) as { server: string; label: string; healthy: boolean; detail: string }[];
  });

  return (
    <Card className="border-border/80 shadow-none" data-testid="card-service-health">
      <CardHeader className="px-4 pb-3 pt-4 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Database className="h-4 w-4 text-primary" aria-hidden="true" />
            Service health
          </CardTitle>
          {services.length > 0 && (
            <span className="font-mono text-xs text-muted-foreground">
              {services.filter((service) => service.healthy).length}/{services.length} healthy
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 sm:px-5">
        {services.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center" data-testid="empty-service-health">
            <Database className="mx-auto mb-2 h-5 w-5 text-muted-foreground/50" aria-hidden="true" />
            <p className="text-sm font-medium">No service telemetry</p>
            <p className="mt-1 text-xs text-muted-foreground">Service checks will appear with the next agent report.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {services.map((service, index) => (
              <div key={`${service.server}-${service.label}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/10 px-3 py-2.5" data-testid={`service-${service.label.toLowerCase()}-${index}`}>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold">{service.label} <span className="font-normal text-muted-foreground">· {service.server}</span></p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{service.detail}</p>
                </div>
                <StatusPill online={service.healthy} label={service.healthy ? "Healthy" : "Down"} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useQuery<HealthReport>({
    queryKey: ["/api/health-report"],
    queryFn: () => apiFetch<HealthReport>("/api/health-report"),
    refetchInterval: 300000,
    staleTime: 60000,
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1440px] space-y-6" aria-busy="true">
        <div className="space-y-2">
          <div className="h-8 w-48 animate-pulse rounded bg-muted" />
          <div className="h-4 w-72 animate-pulse rounded bg-muted" />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl border bg-muted/60" />)}
        </div>
        <Card className="border-border/80 shadow-none"><CardContent className="p-5"><LoadingRows /></CardContent></Card>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto flex min-h-[520px] max-w-[720px] items-center justify-center px-4">
        <Card className="w-full border-red-200 bg-red-50/40 shadow-none" data-testid="error-dashboard">
          <CardContent className="p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-red-700"><AlertTriangle className="h-6 w-6" aria-hidden="true" /></div>
            <h1 className="text-lg font-bold">Dashboard data unavailable</h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{error instanceof Error ? error.message : "The health report could not be loaded. Check the API connection and try again."}</p>
            <Button type="button" onClick={() => refetch()} className="mt-5 gap-2" disabled={isFetching} data-testid="button-retry-dashboard">
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} aria-hidden="true" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const sitesUp = data.sites.filter((site) => site.currentStatus === "up").length;
  const serversOnline = data.servers.filter((server) => server.isOnline).length;
  const allSslEntries = data.servers.flatMap((server) => server.services?.sslExpiry ?? []);
  const minSslDays = allSslEntries.length ? Math.min(...allSslEntries.map((entry) => entry.daysRemaining)) : null;
  const expiredSsl = allSslEntries.filter((entry) => entry.isExpired).length;
  const warningSsl = allSslEntries.filter((entry) => !entry.isExpired && entry.isExpiringSoon).length;
  const serviceEntries = data.servers.flatMap((server) => {
    if (!server.services) return [];
    return [server.services.nginx, server.services.varnish, server.services.phpFpm, server.services.mysql, server.services.elasticsearch].filter(
      (service): service is NonNullable<typeof service> => service !== null,
    );
  });
  const healthyServices = serviceEntries.filter((service) => {
    if ("isRunning" in service) return service.isRunning;
    if ("total" in service) return service.total > 0;
    return true;
  }).length;
  const lastUpdate = dataUpdatedAt ? format(new Date(dataUpdatedAt), "HH:mm:ss") : formatDateTime(data.generatedAt);
  const overallGood = data.overallStatus === "operational";
  const overallLabel = overallGood ? "All systems operational" : data.overallStatus === "outage" ? "Service outage" : "System degraded";

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-[1440px] space-y-6 pb-8">
      <header className="flex flex-col gap-4 border-b border-border/70 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
            Operations control room
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Dashboard</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Magento production stack · live service posture and infrastructure trends</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs text-muted-foreground" data-testid="text-last-updated">
            <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
            Updated {lastUpdate}
          </span>
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh-dashboard">
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} aria-hidden="true" />
            Refresh
          </Button>
        </div>
      </header>

      <section className={`flex flex-col gap-3 rounded-2xl border px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5 ${overallGood ? "border-emerald-200 bg-emerald-50/70" : "border-amber-200 bg-amber-50/70"}`} aria-label="Overall system status" data-testid="status-overall">
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${overallGood ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
            {overallGood ? <ShieldCheck className="h-5 w-5" aria-hidden="true" /> : <AlertTriangle className="h-5 w-5" aria-hidden="true" />}
          </div>
          <div>
            <p className={`text-sm font-bold ${overallGood ? "text-emerald-800" : "text-amber-800"}`}>{overallLabel}</p>
            <p className="text-xs text-muted-foreground">{data.companyName} · Health report generated {formatDateTime(data.generatedAt)}</p>
          </div>
        </div>
        <span className="text-xs font-medium text-muted-foreground">Automatic refresh every 5 minutes</span>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Key infrastructure indicators">
        {[
          { label: "Store availability", value: data.sites.length ? `${sitesUp}/${data.sites.length}` : "—", note: data.sites.length ? `${sitesUp === data.sites.length ? "All endpoints responding" : `${data.sites.length - sitesUp} endpoint issue`}` : "No sites configured", icon: <Globe2 className="h-4 w-4" />, good: data.sites.length > 0 && sitesUp === data.sites.length },
          { label: "Server fleet", value: data.servers.length ? `${serversOnline}/${data.servers.length}` : "—", note: data.servers.length ? `${serversOnline === data.servers.length ? "All agents online" : `${data.servers.length - serversOnline} offline`}` : "No servers configured", icon: <Server className="h-4 w-4" />, good: data.servers.length > 0 && serversOnline === data.servers.length },
          { label: "Service health", value: serviceEntries.length ? `${healthyServices}/${serviceEntries.length}` : "—", note: serviceEntries.length ? `${healthyServices === serviceEntries.length ? "No service faults" : "Attention required"}` : "No telemetry", icon: <Activity className="h-4 w-4" />, good: serviceEntries.length > 0 && healthyServices === serviceEntries.length },
          { label: "Certificate runway", value: minSslDays !== null ? `${minSslDays}d` : "—", note: expiredSsl ? `${expiredSsl} expired certificate` : warningSsl ? `${warningSsl} expiring within threshold` : minSslDays !== null ? "Certificates valid" : "No certificates tracked", icon: <LockKeyhole className="h-4 w-4" />, good: allSslEntries.length > 0 && expiredSsl === 0 && warningSsl === 0 },
        ].map((stat) => (
          <Card key={stat.label} className="border-border/80 shadow-none" data-testid={`card-kpi-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>
            <CardContent className="p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">{stat.label}</span>
                <span className={`rounded-lg p-2 ${stat.good ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}`}>{stat.icon}</span>
              </div>
              <p className="font-mono text-2xl font-bold tracking-tight" data-testid={`value-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>{stat.value}</p>
              <p className={`mt-1 truncate text-xs ${stat.good ? "text-emerald-700" : "text-muted-foreground"}`}>{stat.note}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.45fr)]">
        <Card className="border-border/80 shadow-none" data-testid="card-site-availability">
          <CardHeader className="px-4 pb-3 pt-4 sm:px-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-sm"><Globe2 className="h-4 w-4 text-primary" aria-hidden="true" />Store availability</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">Public endpoints checked by Sentinel</p>
              </div>
              <span className="font-mono text-xs text-muted-foreground">{sitesUp}/{data.sites.length}</span>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 sm:px-5">
            {data.sites.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center" data-testid="empty-sites">
                <Globe2 className="mx-auto mb-2 h-6 w-6 text-muted-foreground/50" aria-hidden="true" />
                <p className="text-sm font-semibold">No sites configured</p>
                <p className="mt-1 text-xs text-muted-foreground">Add a storefront to begin endpoint monitoring.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/70">
                {data.sites.map((site) => {
                  const isUp = site.currentStatus === "up";
                  const isSlow = site.currentStatus === "slow";
                  return (
                    <div key={site.id} className="flex items-center gap-3 py-3 first:pt-1 last:pb-1" data-testid={`row-site-${site.id}`}>
                      <span className={`h-2 w-2 shrink-0 rounded-full ${isUp ? "bg-emerald-500" : isSlow ? "bg-amber-500" : "bg-red-500"}`} aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{site.name}</p>
                        <a href={site.url} target="_blank" rel="noreferrer" className="block truncate text-xs text-muted-foreground hover:text-primary" data-testid={`link-site-${site.id}`}>{site.url.replace(/^https?:\/\//, "")}</a>
                      </div>
                      <div className="shrink-0 text-right">
                        <Badge variant={isUp ? "success" : isSlow ? "warning" : "destructive"}>{statusLabel(site.currentStatus)}</Badge>
                        <p className="mt-1 font-mono text-[11px] text-muted-foreground">{site.lastResponseTimeMs != null ? `${site.lastResponseTimeMs}ms` : "No latency"}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
          {data.sites.some((site) => site.lastCheckedAt) && (
            <div className="flex items-center gap-1.5 border-t border-border/70 bg-muted/20 px-4 py-2.5 text-[11px] text-muted-foreground sm:px-5">
              <Timer className="h-3.5 w-3.5" aria-hidden="true" />
              Last check {data.sites.find((site) => site.lastCheckedAt)?.lastCheckedAt ? formatDistanceToNow(new Date(data.sites.find((site) => site.lastCheckedAt)?.lastCheckedAt as string), { addSuffix: true }) : "not available"}
            </div>
          )}
        </Card>

        <Card className="border-border/80 shadow-none" data-testid="card-server-fleet">
          <CardHeader className="px-4 pb-3 pt-4 sm:px-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-sm"><Server className="h-4 w-4 text-primary" aria-hidden="true" />Server fleet</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">Current capacity snapshot across production hosts</p>
              </div>
              <span className="font-mono text-xs text-muted-foreground">{serversOnline}/{data.servers.length} online</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 px-4 pb-4 sm:px-5">
            {data.servers.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center" data-testid="empty-servers">
                <Server className="mx-auto mb-2 h-6 w-6 text-muted-foreground/50" aria-hidden="true" />
                <p className="text-sm font-semibold">No servers registered</p>
                <p className="mt-1 text-xs text-muted-foreground">Add an agent from the Servers page to see infrastructure health.</p>
              </div>
            ) : data.servers.map((server) => (
              <div key={server.id} className="rounded-xl border border-border/70 bg-muted/10 p-3.5 sm:p-4" data-testid={`row-server-${server.id}`}>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className={`rounded-lg p-2 ${server.isOnline ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}><Server className="h-4 w-4" aria-hidden="true" /></div>
                    <div className="min-w-0"><p className="truncate text-sm font-semibold">{server.name}</p><p className="truncate font-mono text-[11px] text-muted-foreground">{server.hostname}</p></div>
                  </div>
                  <StatusPill online={server.isOnline} label={server.isOnline ? "Online" : "Offline"} />
                </div>
                {server.metrics ? (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <MetricBar label="CPU" value={server.metrics.cpuPercent} icon={<Cpu className="h-3 w-3" aria-hidden="true" />} />
                    <MetricBar label="Memory" value={server.metrics.memPercent} icon={<MemoryStick className="h-3 w-3" aria-hidden="true" />} />
                    <MetricBar label="Disk" value={server.metrics.diskPercent} icon={<HardDrive className="h-3 w-3" aria-hidden="true" />} />
                  </div>
                ) : (
                  <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">{server.isOnline ? "Waiting for first metrics report" : "No metrics · server offline"}</p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border/70 pt-2.5 text-[11px] text-muted-foreground">
                  {server.metrics && <><span className="flex items-center gap-1"><Activity className="h-3 w-3" aria-hidden="true" />Load {server.metrics.loadAvg1m.toFixed(2)}</span>{server.metrics.connectionCount != null && <span className="flex items-center gap-1"><Wifi className="h-3 w-3" aria-hidden="true" />{server.metrics.connectionCount} connections</span>}</>}
                  {server.lastSeenAt && <span className="ml-auto">Seen {formatDistanceToNow(new Date(server.lastSeenAt), { addSuffix: true })}</span>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="historical-trends-heading">
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div><h2 id="historical-trends-heading" className="text-lg font-bold">Historical server trends</h2><p className="text-xs text-muted-foreground">Choose a window to inspect resource pressure and load patterns. Data comes from agent readings.</p></div>
          <span className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">No interpolation</span>
        </div>
        {data.servers.length === 0 ? (
          <Card className="border-dashed border-border shadow-none"><CardContent className="p-8 text-center"><Activity className="mx-auto mb-2 h-6 w-6 text-muted-foreground/50" aria-hidden="true" /><p className="text-sm font-semibold">Historical trends need a server</p><p className="mt-1 text-xs text-muted-foreground">Register a monitoring agent to populate this view.</p></CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">{data.servers.map((server) => <ServerTrend key={server.id} server={server} />)}</div>
        )}
      </section>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.65fr)]">
        <ServiceHealth servers={data.servers} />
        <Card className="border-border/80 shadow-none" data-testid="card-ssl-certificates">
          <CardHeader className="px-4 pb-3 pt-4 sm:px-5">
            <div className="flex items-center justify-between gap-3">
              <div><CardTitle className="flex items-center gap-2 text-sm"><LockKeyhole className="h-4 w-4 text-primary" aria-hidden="true" />SSL certificates</CardTitle><p className="mt-1 text-xs text-muted-foreground">Certificate expiry across monitored servers</p></div>
              <span className="font-mono text-xs text-muted-foreground">{allSslEntries.length} tracked</span>
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {allSslEntries.length === 0 ? (
              <div className="mx-4 mb-4 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center sm:mx-5" data-testid="empty-ssl">
                <LockKeyhole className="mx-auto mb-2 h-6 w-6 text-muted-foreground/50" aria-hidden="true" />
                <p className="text-sm font-semibold">No certificate data reported</p>
                <p className="mt-1 text-xs text-muted-foreground">SSL visibility will populate from the next server telemetry report.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-xs">
                  <thead className="border-y border-border/70 bg-muted/25 text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-2.5 font-semibold sm:px-5">Domain</th><th className="px-4 py-2.5 font-semibold">Status</th><th className="px-4 py-2.5 font-semibold">Expires</th><th className="px-4 py-2.5 text-right font-semibold sm:px-5">Runway</th></tr></thead>
                  <tbody className="divide-y divide-border/70">
                    {allSslEntries.map((entry, index) => {
                      const valid = !entry.isExpired && !entry.isExpiringSoon;
                      return <tr key={`${entry.domain}-${index}`} className="hover:bg-muted/20" data-testid={`row-ssl-${index}`}>
                        <td className="max-w-[260px] truncate px-4 py-3 font-mono text-[11px] sm:px-5">{entry.domain}</td>
                        <td className="px-4 py-3"><span className={`inline-flex items-center gap-1.5 font-semibold ${valid ? "text-emerald-700" : entry.isExpiringSoon ? "text-amber-700" : "text-red-700"}`}><span className={`h-1.5 w-1.5 rounded-full ${valid ? "bg-emerald-500" : entry.isExpiringSoon ? "bg-amber-500" : "bg-red-500"}`} aria-hidden="true" />{entry.isExpired ? "Expired" : entry.isExpiringSoon ? "Expiring soon" : "Valid"}</span></td>
                        <td className="px-4 py-3 text-muted-foreground">{entry.expiresAt ? formatDateTime(entry.expiresAt) : "Date unavailable"}</td>
                        <td className={`px-4 py-3 text-right font-mono font-semibold sm:px-5 ${valid ? "text-foreground" : entry.isExpiringSoon ? "text-amber-700" : "text-red-700"}`}>{entry.isExpired ? "Expired" : `${entry.daysRemaining}d`}</td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <footer className="flex items-center justify-between border-t border-border/70 pt-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />Sentinel health report</span>
        <span className="flex items-center gap-1.5"><ChevronRight className="h-3 w-3" aria-hidden="true" />Use Servers for deeper diagnostics</span>
      </footer>
    </motion.div>
  );
}