import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getGetServerLogSummaryQueryKey,
  getGetServerMetricsQueryKey,
  useGetServerLogSummary,
  useGetServerMetrics,
  type ServerLogSummary,
} from "@workspace/api-client-react";
import { format, formatDistanceToNow } from "date-fns";
import { motion } from "framer-motion";
import {
  Activity,
  BarChart3,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Cpu,
  Database,
  FileWarning,
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
import { cn } from "@/lib/utils";

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
  cpu: "hsl(var(--primary))",
  memory: "hsl(var(--warning))",
  disk: "hsl(var(--success))",
  load: "hsl(var(--destructive))",
  grid: "hsl(var(--border) / 0.5)",
  tick: "hsl(var(--muted-foreground))",
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
  const tones = {
    muted: { text: "text-muted-foreground", bg: "bg-muted", bar: "bg-muted" },
    good: { text: "text-success", bg: "bg-success/10", bar: "bg-success" },
    warning: { text: "text-warning", bg: "bg-warning/10", bar: "bg-warning" },
    danger: { text: "text-destructive", bg: "bg-destructive/10", bar: "bg-destructive" },
  };

  return (
    <div className="space-y-2 bg-card border border-border/50 rounded-xl p-3 shadow-sm" data-testid={`metric-${label.toLowerCase()}`}>
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground font-medium uppercase tracking-wider text-[10px]">
          {icon}
          {label}
        </span>
        <span className={cn("font-mono font-bold text-sm", tones[tone].text)}>
          {formatPercent(value)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted/50" aria-hidden="true">
        <div
          className={cn("h-full rounded-full transition-all duration-500 ease-out", tones[tone].bar)}
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
      ? "bg-muted text-muted-foreground border-border"
      : online
        ? "bg-success/10 text-success border-success/20"
        : "bg-destructive/10 text-destructive border-destructive/20";

  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-bold uppercase tracking-wider", classes)}
      data-testid={`status-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  );
}

function LoadingRows({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4" aria-label="Loading monitoring data" data-testid="loading-dashboard">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex animate-pulse items-center gap-4 bg-muted/20 p-4 rounded-xl">
          <div className="h-10 w-10 rounded-xl bg-muted" />
          <div className="flex-1 space-y-2.5">
            <div className="h-3 w-1/3 rounded bg-muted" />
            <div className="h-2 w-1/2 rounded bg-muted" />
          </div>
          <div className="h-6 w-20 rounded-md bg-muted" />
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
    <div className="rounded-xl border border-border bg-card/95 backdrop-blur shadow-xl p-3 text-xs z-50">
      <p className="mb-2 font-bold text-foreground border-b border-border/50 pb-2">{label}</p>
      <div className="space-y-1.5">
        {payload.map((item) => (
          <div key={item.name} className="flex items-center justify-between gap-6">
            <span className="flex items-center gap-2 text-muted-foreground font-medium">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
              {item.name}
            </span>
            <span className="font-mono font-bold text-foreground">
              {typeof item.value === "number" ? item.value.toFixed(1) : "—"}
              {item.name === "CPU" || item.name === "Memory" || item.name === "Disk" ? "%" : ""}
            </span>
          </div>
        ))}
      </div>
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
    <Card className="overflow-hidden flex flex-col h-full" data-testid={`card-server-trend-${server.id}`}>
      <CardHeader className="border-b border-border/50 bg-muted/10 px-5 py-4 shrink-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-[15px]">
              <Activity className="h-4 w-4 text-primary" aria-hidden="true" />
              {server.name}
            </CardTitle>
            <div className="flex items-center gap-2 mt-1">
              <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{server.hostname}</span>
              <span className="text-[11px] text-muted-foreground font-medium">
                {metrics?.length ? `${metrics.length} readings` : "Waiting for metrics"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-border bg-muted/50 p-1" aria-label={`Time range for ${server.name}`}>
              {[1, 6, 24].map((range) => (
                <button
                  key={range}
                  type="button"
                  onClick={() => setHours(range)}
                  aria-pressed={hours === range}
                  data-testid={`button-trend-${server.id}-${range}h`}
                  className={cn(
                    "rounded-md px-3 py-1 text-[11px] font-bold transition-all",
                    hours === range 
                      ? "bg-background text-foreground shadow-sm" 
                      : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                  )}
                >
                  {range}h
                </button>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-7 w-7 rounded-lg"
              onClick={() => refetch()}
              disabled={isFetching}
              aria-label={`Refresh ${server.name} trend`}
              data-testid={`button-refresh-trend-${server.id}`}
            >
              <RefreshCw className={cn("h-3 w-3", isFetching && "animate-spin")} aria-hidden="true" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-5 flex-1 min-h-[250px] relative">
        {isLoading ? (
          <div className="absolute inset-5 flex items-end gap-2" aria-label="Loading chart">
            {[42, 68, 54, 82, 48, 72, 61, 88, 52, 75, 45, 64].map((height, index) => (
              <div key={index} className="flex-1 animate-pulse rounded-t-sm bg-muted" style={{ height: `${height}%` }} />
            ))}
          </div>
        ) : isError ? (
          <div className="absolute inset-5 flex flex-col items-center justify-center rounded-xl border border-dashed border-destructive/30 bg-destructive/5 text-center" data-testid={`error-chart-${server.id}`}>
            <AlertTriangle className="mb-2 h-8 w-8 text-destructive opacity-80" aria-hidden="true" />
            <p className="text-sm font-bold text-destructive">Trend Unavailable</p>
            <p className="mt-1 max-w-[200px] text-xs text-muted-foreground">Failed to load metrics history.</p>
            <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => refetch()} data-testid={`button-retry-chart-${server.id}`}>
              Retry
            </Button>
          </div>
        ) : chartData.length === 0 ? (
          <div className="absolute inset-5 flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 text-center" data-testid={`empty-chart-${server.id}`}>
            <Activity className="mb-2 h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
            <p className="text-sm font-bold text-foreground">No History</p>
            <p className="mt-1 max-w-[250px] text-xs text-muted-foreground">Awaiting first agent report.</p>
          </div>
        ) : (
          <div className="absolute inset-5" data-testid={`chart-server-${server.id}`}>
            <ResponsiveContainer width="100%" height="100%" debounce={0}>
              <LineChart data={chartData} margin={{ top: 5, right: 0, bottom: 0, left: -25 }}>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke={CHART_COLORS.grid} />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: CHART_COLORS.tick, fontWeight: 500 }} tickLine={false} axisLine={false} minTickGap={30} dy={10} />
                <YAxis domain={[0, "auto"]} tick={{ fontSize: 10, fill: CHART_COLORS.tick, fontFamily: "monospace" }} tickLine={false} axisLine={false} dx={-10} />
                <Tooltip content={<ChartTooltipContent />} cursor={{ stroke: CHART_COLORS.grid, strokeWidth: 1 }} isAnimationActive={false} />
                <Legend wrapperStyle={{ fontSize: "11px", fontWeight: 600, paddingTop: "20px" }} iconType="circle" />
                <Line type="monotone" dataKey="CPU" stroke={CHART_COLORS.cpu} strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
                <Line type="monotone" dataKey="Memory" stroke={CHART_COLORS.memory} strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
                <Line type="monotone" dataKey="Disk" stroke={CHART_COLORS.disk} strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
                <Line type="monotone" dataKey="Load" stroke={CHART_COLORS.load} strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls isAnimationActive={false} />
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
      svc.nginx && { server: server.name, label: "Nginx", healthy: svc.nginx.isRunning, detail: svc.nginx.activeConnections != null ? `${svc.nginx.activeConnections} active connections` : "Web server", icon: <Globe2 className="h-5 w-5" /> },
      svc.varnish && { server: server.name, label: "Varnish", healthy: svc.varnish.isRunning, detail: svc.varnish.hitRate != null ? `${svc.varnish.hitRate}% cache hit rate` : "Cache layer", icon: <Activity className="h-5 w-5" /> },
      svc.phpFpm && { server: server.name, label: "PHP-FPM", healthy: svc.phpFpm.total > 0, detail: `${svc.phpFpm.active} active / ${svc.phpFpm.total} workers`, icon: <Cpu className="h-5 w-5" /> },
      svc.mysql && { server: server.name, label: "MySQL", healthy: true, detail: `${svc.mysql.threads} threads · ${svc.mysql.slowQueries} slow queries`, icon: <Database className="h-5 w-5" /> },
      svc.elasticsearch && { server: server.name, label: "OpenSearch", healthy: svc.elasticsearch.isRunning && svc.elasticsearch.status !== "red", detail: svc.elasticsearch.status ? `Cluster ${svc.elasticsearch.status}` : svc.elasticsearch.error || "Search cluster", icon: <Server className="h-5 w-5" /> },
    ].filter(Boolean) as { server: string; label: string; healthy: boolean; detail: string; icon: React.ReactNode }[];
  });

  return (
    <Card className="order-4 flex flex-col xl:col-span-12" data-testid="card-service-health">
      <CardHeader className="px-5 pb-4 pt-5 shrink-0 border-b border-border/50">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-[15px]">
              <Database className="h-4 w-4 text-primary" aria-hidden="true" />
              Service Health
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Application layer dependencies across the production stack</p>
          </div>
          {services.length > 0 && (
            <Badge variant="outline" className="font-mono text-xs">
              {services.filter((service) => service.healthy).length}/{services.length} UP
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5 pt-5 flex-1">
        {services.length === 0 ? (
          <div className="h-full min-h-[200px] flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 text-center px-4" data-testid="empty-service-health">
            <Database className="mb-3 h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
            <p className="text-sm font-bold">No Service Telemetry</p>
            <p className="mt-1 text-xs text-muted-foreground max-w-[250px]">Install specific integration plugins on agents to track services.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {services.map((service, index) => (
              <div key={`${service.server}-${service.label}-${index}`} className="group flex min-h-[112px] flex-col justify-between rounded-xl border border-border bg-muted/10 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md" data-testid={`service-${service.label.toLowerCase()}-${index}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg transition-colors", service.healthy ? "bg-success/10 text-success group-hover:bg-success/15" : "bg-destructive/10 text-destructive")}>
                    {service.icon}
                  </div>
                  <StatusPill online={service.healthy} label={service.healthy ? "Up" : "Down"} />
                </div>
                <div className="mt-4 min-w-0">
                   <p className="truncate text-sm font-bold text-foreground">{service.label}</p>
                   <p className="mt-1 truncate text-[10px] font-mono text-muted-foreground">{service.detail}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatLogSource(source: string) {
  const labels: Record<string, string> = {
    nginxError: "Nginx",
    phpFpm: "PHP-FPM",
    failedServices: "Failed services",
    meta: "Meta / Facebook",
    stripe: "Stripe",
  };
  return labels[source] ?? source.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function LogSummaryBar({ summary }: { summary: ServerLogSummary }) {
  const classifiedCount = summary.errorCount + summary.warningCount;
  const safeTotal = Math.max(summary.totalEntries, classifiedCount, 1);
  const errorWidth = (summary.errorCount / safeTotal) * 100;
  const warningWidth = (summary.warningCount / safeTotal) * 100;
  const neutralWidth = Math.max(0, 100 - errorWidth - warningWidth);

  return (
    <div className="space-y-2" aria-label="Log severity distribution">
      <div className="flex h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${summary.errorCount} errors and ${summary.warningCount} warnings`}>
        <div className="bg-destructive transition-all" style={{ width: `${errorWidth}%` }} />
        <div className="bg-warning transition-all" style={{ width: `${warningWidth}%` }} />
        <div className="bg-success/60 transition-all" style={{ width: `${neutralWidth}%` }} />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-destructive" />{summary.errorCount} errors</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-warning" />{summary.warningCount} warnings</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-success/60" />{Math.max(0, summary.totalEntries - classifiedCount)} normal</span>
      </div>
    </div>
  );
}

function ServerLogIntelligence({ server }: { server: HealthReport["servers"][number] }) {
  const hours = 6;
  const { data: summary, isLoading, isError } = useGetServerLogSummary(server.id, { hours }, {
    query: {
      queryKey: getGetServerLogSummaryQueryKey(server.id, { hours }),
      refetchInterval: 300000,
    },
  });

  if (isLoading) {
    return <div className="h-[250px] animate-pulse rounded-xl bg-muted/40" aria-label={`Loading log summary for ${server.name}`} />;
  }

  if (isError || !summary) {
    return (
      <div className="rounded-xl border border-dashed border-destructive/30 bg-destructive/5 p-5" data-testid={`log-summary-error-${server.id}`}>
        <div className="flex items-center gap-2 text-sm font-bold text-destructive">
          <FileWarning className="h-4 w-4" aria-hidden="true" />
          Log analysis unavailable
        </div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">The dashboard could not load the analyzed log summary for this server.</p>
      </div>
    );
  }

  const issueTone = summary.errorCount > 0
    ? { label: "Needs attention", className: "border-destructive/30 bg-destructive/5 text-destructive" }
    : summary.warningCount > 0
      ? { label: "Review warnings", className: "border-warning/30 bg-warning/5 text-warning" }
      : { label: "No classified issues", className: "border-success/30 bg-success/5 text-success" };

  return (
    <div className="rounded-xl border border-border bg-muted/10 p-4" data-testid={`log-summary-${server.id}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-foreground">{server.name}</p>
          <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">{server.hostname}</p>
        </div>
        <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wider", issueTone.className)}>
          {summary.errorCount > 0 ? <AlertTriangle className="h-3 w-3" aria-hidden="true" /> : <CheckCircle2 className="h-3 w-3" aria-hidden="true" />}
          {issueTone.label}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Snapshots</p>
          <p className="mt-1 font-display text-xl font-bold text-foreground">{summary.snapshotCount}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Entries</p>
          <p className="mt-1 font-display text-xl font-bold text-foreground">{summary.totalEntries.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sources</p>
          <p className="mt-1 font-display text-xl font-bold text-foreground">{summary.sourceCounts.length}</p>
        </div>
      </div>

      <div className="mt-4">
        <LogSummaryBar summary={summary} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <BarChart3 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            Log volume by source
          </div>
          <div className="space-y-2.5">
            {summary.sourceCounts.slice(0, 5).map((source) => {
              const width = summary.totalEntries > 0 ? Math.max(4, (source.entries / summary.totalEntries) * 100) : 0;
              return (
                <div key={source.source}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                    <span className="truncate text-muted-foreground">{formatLogSource(source.source)}</span>
                    <span className="font-mono font-semibold text-foreground">{source.entries.toLocaleString()}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary/70" style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })}
            {summary.sourceCounts.length === 0 && <p className="text-xs text-muted-foreground">No log sources detected yet.</p>}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <FileWarning className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
            Recent signals
          </div>
          {summary.recentIssues.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">{summary.message}</p>
          ) : (
            <div className="space-y-2">
              {summary.recentIssues.slice(0, 3).map((issue, index) => (
                <div key={`${issue.recordedAt}-${issue.source}-${index}`} className="rounded-lg border border-border bg-card px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className={cn("text-[10px] font-bold uppercase tracking-wider", issue.severity === "error" ? "text-destructive" : "text-warning")}>
                      {issue.severity} · {formatLogSource(issue.source)}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{formatDateTime(issue.recordedAt)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{issue.line}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LogIntelligence({ servers }: { servers: HealthReport["servers"] }) {
  return (
    <Card className="order-4 flex flex-col xl:col-span-12" data-testid="card-log-intelligence">
      <CardHeader className="border-b border-border/50 px-5 pb-4 pt-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-[15px]">
              <div className="rounded-lg bg-primary/10 p-1.5 text-primary"><BarChart3 className="h-4 w-4" aria-hidden="true" /></div>
              Log Intelligence
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Analyzed sanitized logs from the last 6 hours, summarized by server</p>
          </div>
          <a href="/incident-analysis" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
            Open Incident Analysis
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
      </CardHeader>
      <CardContent className="p-5">
        {servers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-10 text-center">
            <FileWarning className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
            <p className="text-sm font-bold text-foreground">No logs to analyze</p>
            <p className="mt-1 text-xs text-muted-foreground">Register a server and install its monitoring agent to begin.</p>
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {servers.map((server) => <ServerLogIntelligence key={server.id} server={server} />)}
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
      <div className="space-y-6" aria-busy="true">
        <div className="space-y-3 border-b border-border pb-6">
          <div className="h-5 w-32 animate-pulse rounded bg-muted" />
          <div className="h-10 w-64 animate-pulse rounded-lg bg-muted" />
          <div className="h-4 w-96 animate-pulse rounded bg-muted" />
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-32 animate-pulse rounded-2xl bg-muted" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-[400px] animate-pulse rounded-2xl bg-muted" />
          <div className="h-[400px] animate-pulse rounded-2xl bg-muted" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="w-full max-w-md border-destructive/30 bg-destructive/5 shadow-xl" data-testid="error-dashboard">
          <CardContent className="p-8 text-center flex flex-col items-center">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <AlertTriangle className="h-8 w-8" aria-hidden="true" />
            </div>
            <h1 className="text-xl font-display font-bold text-foreground">Dashboard Offline</h1>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              {error instanceof Error ? error.message : "The health report could not be loaded. Verify API connectivity."}
            </p>
            <Button type="button" onClick={() => refetch()} className="mt-8 gap-2 w-full sm:w-auto" disabled={isFetching} data-testid="button-retry-dashboard">
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} aria-hidden="true" />
              Re-establish Connection
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
  const overallLabel = overallGood ? "All systems operational" : data.overallStatus === "outage" ? "Service outage detected" : "System performance degraded";

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 gap-6 pb-10 xl:grid-cols-12">
      
      {/* Page Header */}
      <header className="order-1 flex flex-col gap-4 border-b border-border pb-6 lg:col-span-12 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            Operations Control Room
          </div>
          <h1 className="text-3xl font-display font-bold tracking-tight sm:text-4xl text-foreground">Fleet Dashboard</h1>
          <p className="mt-2 text-sm text-muted-foreground font-medium max-w-2xl leading-relaxed">
            Live telemetry and health posture for the Magento production stack.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card/50 px-3 py-1.5 text-xs text-muted-foreground font-mono" data-testid="text-last-updated">
            <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="font-semibold text-foreground">{lastUpdate}</span>
          </div>
          <Button type="button" variant="outline" size="sm" className="gap-2 font-semibold shadow-sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh-dashboard">
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} aria-hidden="true" />
            Sync
          </Button>
        </div>
      </header>

      {/* Global Status Banner */}
      <section 
        className={cn(
          "relative order-2 overflow-hidden rounded-2xl border p-5 shadow-sm transition-colors sm:p-6 lg:col-span-12",
          overallGood 
            ? "border-success/30 bg-success/5" 
            : data.overallStatus === "outage" ? "border-destructive/30 bg-destructive/5" : "border-warning/30 bg-warning/5"
        )} 
        aria-label="Overall system status" 
        data-testid="status-overall"
      >
        <div className="absolute right-0 top-0 h-full w-64 bg-gradient-to-l from-background/50 to-transparent pointer-events-none" />
        <div className="flex items-start gap-4 relative z-10">
          <div className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-inner",
            overallGood ? "bg-success text-success-foreground" : data.overallStatus === "outage" ? "bg-destructive text-destructive-foreground" : "bg-warning text-warning-foreground"
          )}>
            {overallGood ? <ShieldCheck className="h-6 w-6" aria-hidden="true" /> : <AlertTriangle className="h-6 w-6" aria-hidden="true" />}
          </div>
          <div className="flex flex-col flex-1 justify-center min-h-[48px]">
            <div className="flex flex-wrap items-center gap-3 mb-1">
              <h2 className={cn(
                "text-lg font-display font-bold tracking-tight",
                overallGood ? "text-success" : data.overallStatus === "outage" ? "text-destructive" : "text-warning"
              )}>
                {overallLabel}
              </h2>
              {!overallGood && (
                 <Badge variant="outline" className={cn(
                   "font-mono uppercase text-[10px] tracking-wider",
                   data.overallStatus === "outage" ? "border-destructive text-destructive" : "border-warning text-warning"
                 )}>
                   INCIDENT ACTIVE
                 </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-muted-foreground">
              <span>{data.companyName}</span>
              <span className="hidden sm:inline text-border">•</span>
              <span>Report generated {formatDateTime(data.generatedAt)}</span>
              <span className="hidden sm:inline text-border">•</span>
              <span className="flex items-center gap-1.5"><Timer className="w-3 h-3"/> Auto-sync 5m</span>
            </div>
          </div>
        </div>
      </section>

      {/* KPI Cards */}
      <section className="order-3 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:col-span-12 lg:grid-cols-4" aria-label="Key infrastructure indicators">
        {[
          { 
            label: "Storefronts", 
            value: data.sites.length ? `${sitesUp}/${data.sites.length}` : "—", 
            note: data.sites.length ? `${sitesUp === data.sites.length ? "All responding" : `${data.sites.length - sitesUp} down`}` : "None configured", 
            icon: <Globe2 className="h-5 w-5" />, 
            good: data.sites.length > 0 && sitesUp === data.sites.length,
            danger: data.sites.length > 0 && sitesUp < data.sites.length
          },
          { 
            label: "Server Fleet", 
            value: data.servers.length ? `${serversOnline}/${data.servers.length}` : "—", 
            note: data.servers.length ? `${serversOnline === data.servers.length ? "All agents online" : `${data.servers.length - serversOnline} offline`}` : "None registered", 
            icon: <Server className="h-5 w-5" />, 
            good: data.servers.length > 0 && serversOnline === data.servers.length,
            danger: data.servers.length > 0 && serversOnline < data.servers.length
          },
          { 
            label: "Service Layer", 
            value: serviceEntries.length ? `${healthyServices}/${serviceEntries.length}` : "—", 
            note: serviceEntries.length ? `${healthyServices === serviceEntries.length ? "No faults detected" : `${serviceEntries.length - healthyServices} failing`}` : "No telemetry", 
            icon: <Activity className="h-5 w-5" />, 
            good: serviceEntries.length > 0 && healthyServices === serviceEntries.length,
            danger: serviceEntries.length > 0 && healthyServices < serviceEntries.length
          },
          { 
            label: "SSL Runway", 
            value: minSslDays !== null ? `${minSslDays}d` : "—", 
            note: expiredSsl ? `${expiredSsl} expired` : warningSsl ? `${warningSsl} expiring soon` : minSslDays !== null ? "Valid certificates" : "Not tracked", 
            icon: <LockKeyhole className="h-5 w-5" />, 
            good: allSslEntries.length > 0 && expiredSsl === 0 && warningSsl === 0,
            danger: expiredSsl > 0 || warningSsl > 0
          },
        ].map((stat) => (
          <Card key={stat.label} className={cn(
            "relative overflow-hidden group",
            stat.danger && "border-destructive/40 shadow-[0_0_15px_rgba(var(--destructive),0.1)]"
          )} data-testid={`card-kpi-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>
            <div className={cn(
              "absolute inset-x-0 top-0 h-1",
              stat.good ? "bg-success" : stat.danger ? "bg-destructive" : "bg-muted"
            )} />
            <CardContent className="p-5 sm:p-6">
              <div className="flex items-start justify-between mb-4">
                <span className="text-sm font-semibold text-foreground">{stat.label}</span>
                <div className={cn(
                  "p-2 rounded-xl transition-colors",
                  stat.good ? "bg-success/10 text-success" : stat.danger ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground group-hover:bg-muted/80"
                )}>
                  {stat.icon}
                </div>
              </div>
              <div className="space-y-1">
                <p className="font-display text-3xl font-bold tracking-tight text-foreground" data-testid={`value-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>{stat.value}</p>
                <p className={cn("text-xs font-medium", stat.good ? "text-success" : stat.danger ? "text-destructive" : "text-muted-foreground")}>{stat.note}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* Grid: Availability & Fleet */}
      <section className="contents">
        <LogIntelligence servers={data.servers} />
        <Card className="order-8 flex flex-col xl:col-span-6" data-testid="card-site-availability">
          <CardHeader className="px-5 sm:px-6 pt-6 pb-4 border-b border-border/50 shrink-0">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2.5 text-base">
                  <div className="bg-primary/10 p-1.5 rounded-lg text-primary"><Globe2 className="h-4 w-4" /></div>
                  Public Endpoints
                </CardTitle>
                <p className="text-xs text-muted-foreground font-medium">External availability checks</p>
              </div>
              <Badge variant="secondary" className="font-mono text-xs">{sitesUp}/{data.sites.length} UP</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1 flex flex-col">
            {data.sites.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center" data-testid="empty-sites">
                <div className="bg-muted p-4 rounded-full mb-3"><Globe2 className="h-8 w-8 text-muted-foreground/60" /></div>
                <p className="text-sm font-bold text-foreground">No Sites Configured</p>
                <p className="mt-1 text-xs text-muted-foreground max-w-[250px]">Add a storefront URL in Settings to begin monitoring availability.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {data.sites.map((site) => {
                  const isUp = site.currentStatus === "up";
                  const isSlow = site.currentStatus === "slow";
                  return (
                    <div key={site.id} className="flex items-center gap-4 p-5 sm:px-6 hover:bg-muted/10 transition-colors group" data-testid={`row-site-${site.id}`}>
                      <div className="relative flex shrink-0">
                         <span className={cn("absolute inline-flex h-full w-full rounded-full opacity-20", isUp ? "bg-success" : isSlow ? "bg-warning" : "bg-destructive animate-ping")} />
                         <span className={cn("relative h-3 w-3 rounded-full", isUp ? "bg-success" : isSlow ? "bg-warning" : "bg-destructive")} aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="truncate text-sm font-bold text-foreground group-hover:text-primary transition-colors">{site.name}</p>
                        <a href={site.url} target="_blank" rel="noreferrer" className="block truncate text-xs text-muted-foreground hover:underline font-mono" data-testid={`link-site-${site.id}`}>
                          {site.url.replace(/^https?:\/\//, "")}
                        </a>
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-1.5">
                        <Badge variant={isUp ? "default" : isSlow ? "secondary" : "destructive"} className={cn(
                          isUp && "bg-success/10 text-success hover:bg-success/20 border-transparent",
                          isSlow && "bg-warning/10 text-warning hover:bg-warning/20 border-transparent"
                        )}>
                          {statusLabel(site.currentStatus)}
                        </Badge>
                        <span className="font-mono text-[11px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {site.lastResponseTimeMs != null ? `${site.lastResponseTimeMs}ms` : "—"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
          {data.sites.some((site) => site.lastCheckedAt) && (
            <div className="mt-auto px-5 sm:px-6 py-3 border-t border-border/50 bg-muted/10 flex items-center gap-2 text-[11px] font-medium text-muted-foreground shrink-0">
              <Timer className="h-3.5 w-3.5 text-muted-foreground/70" />
              Last check {data.sites.find((site) => site.lastCheckedAt)?.lastCheckedAt ? formatDistanceToNow(new Date(data.sites.find((site) => site.lastCheckedAt)?.lastCheckedAt as string), { addSuffix: true }) : "unknown"}
            </div>
          )}
        </Card>

        <Card className="order-7 flex flex-col xl:col-span-12" data-testid="card-server-fleet">
          <CardHeader className="px-5 sm:px-6 pt-6 pb-4 border-b border-border/50 shrink-0">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2.5 text-base">
                  <div className="bg-primary/10 p-1.5 rounded-lg text-primary"><Server className="h-4 w-4" /></div>
                  Infrastructure Nodes
                </CardTitle>
                <p className="text-xs text-muted-foreground font-medium">Active server agents</p>
              </div>
              <Badge variant="secondary" className="font-mono text-xs">{serversOnline}/{data.servers.length} UP</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-5 space-y-4 flex-1 overflow-y-auto max-h-[600px]">
            {data.servers.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center" data-testid="empty-servers">
                <div className="bg-muted p-4 rounded-full mb-3"><Server className="h-8 w-8 text-muted-foreground/60" /></div>
                <p className="text-sm font-bold text-foreground">No Agents Registered</p>
                <p className="mt-1 text-xs text-muted-foreground max-w-[250px]">Deploy the Sentinel agent to your servers to track resources.</p>
              </div>
            ) : data.servers.map((server) => (
              <div key={server.id} className="rounded-xl border border-border bg-card shadow-sm overflow-hidden" data-testid={`row-server-${server.id}`}>
                <div className="p-4 border-b border-border/50 bg-muted/5 flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={cn("p-2 rounded-lg shrink-0", server.isOnline ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
                      <Server className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <p className="truncate text-sm font-bold text-foreground">{server.name}</p>
                      <p className="truncate font-mono text-[10px] font-medium text-muted-foreground">{server.hostname}</p>
                    </div>
                  </div>
                  <StatusPill online={server.isOnline} label={server.isOnline ? "Online" : "Offline"} />
                </div>
                
                <div className="p-4">
                  {server.metrics ? (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <MetricBar label="CPU" value={server.metrics.cpuPercent} icon={<Cpu className="h-3.5 w-3.5" />} warning={85} />
                      <MetricBar label="MEM" value={server.metrics.memPercent} icon={<MemoryStick className="h-3.5 w-3.5" />} warning={85} />
                      <MetricBar label="DSK" value={server.metrics.diskPercent} icon={<HardDrive className="h-3.5 w-3.5" />} warning={90} />
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-4 py-3 text-center">
                      <p className="text-xs font-medium text-muted-foreground">
                        {server.isOnline ? "Awaiting initial metric payload" : "Agent offline. Metrics unavailable."}
                      </p>
                    </div>
                  )}
                </div>

                <div className="bg-muted/10 px-4 py-2 border-t border-border/50 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  <div className="flex gap-4">
                    {server.metrics && (
                      <>
                        <span className="flex items-center gap-1.5 font-mono"><Activity className="h-3 w-3" />L {server.metrics.loadAvg1m.toFixed(2)}</span>
                        {server.metrics.connectionCount != null && <span className="flex items-center gap-1.5 font-mono"><Wifi className="h-3 w-3" />{server.metrics.connectionCount} conn</span>}
                      </>
                    )}
                  </div>
                  {server.lastSeenAt && <span className="text-right flex-1 sm:flex-none">Ping {formatDistanceToNow(new Date(server.lastSeenAt), { addSuffix: true })}</span>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      {/* Historical Trends */}
      <section aria-labelledby="historical-trends-heading" className="order-5 space-y-4 border-t border-border pt-6 xl:col-span-12">
        <div className="flex flex-col gap-2 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between px-1">
          <div>
            <h2 id="historical-trends-heading" className="flex items-center gap-2 text-xl font-display font-bold text-foreground">
              <Activity className="h-5 w-5 text-primary" aria-hidden="true" />
              Resource Trends
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">CPU, Memory, Disk, and load utilization over time</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {[
              { label: "CPU", icon: <Cpu className="h-3.5 w-3.5" />, color: "text-primary" },
              { label: "Memory", icon: <MemoryStick className="h-3.5 w-3.5" />, color: "text-warning" },
              { label: "Disk", icon: <HardDrive className="h-3.5 w-3.5" />, color: "text-success" },
              { label: "Load", icon: <Activity className="h-3.5 w-3.5" />, color: "text-destructive" },
            ].map((metric) => (
              <span key={metric.label} className={cn("inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide", metric.color)}>
                {metric.icon}
                {metric.label}
              </span>
            ))}
          </div>
        </div>
        
        {data.servers.length === 0 ? (
          <Card className="border-dashed shadow-none">
            <CardContent className="p-10 text-center">
              <Activity className="mx-auto mb-4 h-10 w-10 text-muted-foreground/30" aria-hidden="true" />
              <p className="text-base font-bold text-foreground">Trends Requires Agents</p>
              <p className="mt-2 text-sm text-muted-foreground max-w-sm mx-auto">Register a monitoring agent to your servers to visualize resource utilization history.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:gap-6 lg:gap-8">
            {data.servers.map((server) => <ServerTrend key={server.id} server={server} />)}
          </div>
        )}
      </section>

      {/* Service health is positioned directly after the KPI row; endpoint and certificate detail finish the page. */}
      <section className="contents">
        <ServiceHealth servers={data.servers} />
        
        <Card className="order-9 flex flex-col xl:col-span-6" data-testid="card-ssl-certificates">
          <CardHeader className="px-5 sm:px-6 pt-6 pb-4 border-b border-border/50 shrink-0">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2.5 text-base">
                  <div className="bg-primary/10 p-1.5 rounded-lg text-primary"><LockKeyhole className="h-4 w-4" /></div>
                  Security Certificates
                </CardTitle>
                <p className="text-xs text-muted-foreground font-medium">SSL/TLS expiration tracking</p>
              </div>
              <Badge variant="secondary" className="font-mono text-xs">{allSslEntries.length} CERTS</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1">
            {allSslEntries.length === 0 ? (
              <div className="m-5 sm:m-6 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-10 text-center flex flex-col items-center" data-testid="empty-ssl">
                <LockKeyhole className="mb-3 h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
                <p className="text-sm font-bold text-foreground">No Certificates Tracked</p>
                <p className="mt-1 text-xs text-muted-foreground max-w-[250px]">Certificate discovery runs automatically during agent telemetry collection.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="border-b border-border/50 bg-muted/10 text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                    <tr>
                      <th className="px-5 sm:px-6 py-3">Domain</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Expiration Date</th>
                      <th className="px-5 sm:px-6 py-3 text-right">Runway</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {allSslEntries.map((entry, index) => {
                      const valid = !entry.isExpired && !entry.isExpiringSoon;
                      return (
                        <tr key={`${entry.domain}-${index}`} className="hover:bg-muted/10 transition-colors group" data-testid={`row-ssl-${index}`}>
                          <td className="px-5 sm:px-6 py-4 font-mono text-[11px] font-semibold text-foreground">{entry.domain}</td>
                          <td className="px-4 py-4">
                            <span className={cn(
                              "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border",
                              valid ? "bg-success/10 text-success border-success/20" : 
                              entry.isExpiringSoon ? "bg-warning/10 text-warning border-warning/20" : 
                              "bg-destructive/10 text-destructive border-destructive/20"
                            )}>
                              {entry.isExpired ? "Expired" : entry.isExpiringSoon ? "Expiring" : "Valid"}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-xs font-medium text-muted-foreground">
                            {entry.expiresAt ? formatDateTime(entry.expiresAt) : "Unknown"}
                          </td>
                          <td className={cn(
                            "px-5 sm:px-6 py-4 text-right font-mono text-sm font-bold",
                            valid ? "text-foreground" : entry.isExpiringSoon ? "text-warning" : "text-destructive"
                          )}>
                            {entry.isExpired ? "0d" : `${entry.daysRemaining}d`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <footer className="order-10 col-span-1 mt-2 flex w-full flex-col items-center justify-between gap-4 border-t border-border pt-6 pb-2 text-xs font-medium text-muted-foreground sm:flex-row xl:col-span-12">
        <span className="flex shrink-0 items-center gap-2 whitespace-nowrap"><ShieldCheck className="h-4 w-4 text-primary" /> Sentinel System Dashboard</span>
        <span className="flex shrink-0 items-center gap-1 whitespace-nowrap">V 1.0.0 <ChevronRight className="h-3 w-3 opacity-50" /> Internal Ops</span>
      </footer>
    </motion.div>
  );
}