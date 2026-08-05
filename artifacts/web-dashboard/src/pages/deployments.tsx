import { useMemo, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  GitBranch,
  GitCommitHorizontal,
  LoaderCircle,
  PackageCheck,
  RefreshCw,
  Search,
  Server,
  SlidersHorizontal,
  Timer,
  X,
  CircleCheck,
  CircleDashed,
  CircleX,
  Ban,
  HelpCircle,
  KeyRound,
} from "lucide-react";
import {
  getGetDeploymentQueryKey,
  getListDeploymentsQueryKey,
  getListDeploymentSystemsQueryKey,
  useGetDeployment,
  useListDeployments,
  useListDeploymentSystems,
  useRotateDeploymentSystemSecret,
} from "@workspace/api-client-react";
import type { Deployment, DeploymentSystem, ListDeploymentsParams } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

type StatusValue = "running" | "successful" | "failed" | "canceled" | "unknown";

const statusMeta: Record<
  StatusValue,
  { label: string; icon: typeof CircleCheck; classes: string }
> = {
  successful: {
    label: "Successful",
    icon: CircleCheck,
    classes: "bg-success/12 text-success border-success/25",
  },
  running: {
    label: "Running",
    icon: LoaderCircle,
    classes: "bg-primary/10 text-primary border-primary/25",
  },
  failed: {
    label: "Failed",
    icon: CircleX,
    classes: "bg-destructive/10 text-destructive border-destructive/25",
  },
  canceled: {
    label: "Canceled",
    icon: Ban,
    classes: "bg-warning/12 text-warning border-warning/25",
  },
  unknown: {
    label: "Unknown",
    icon: HelpCircle,
    classes: "bg-muted text-muted-foreground border-border",
  },
};

function formatDate(value?: string | null, compact = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, compact
    ? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
    : { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }
  ).format(date);
}

function formatDuration(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const seconds = Math.max(0, Math.round(value / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function shortSha(value?: string | null) {
  if (!value) return "—";
  return value.length > 10 ? `${value.slice(0, 7)}...${value.slice(-4)}` : value;
}

function statusBadge(status: string) {
  const meta = statusMeta[(status as StatusValue) in statusMeta ? status as StatusValue : "unknown"];
  const Icon = meta.icon;
  return (
    <Badge
      variant="outline"
      className={`gap-1.5 whitespace-nowrap font-semibold ${meta.classes}`}
      data-testid={`status-deployment-${status}`}
    >
      <Icon className={`h-3.5 w-3.5 ${status === "running" ? "animate-spin" : ""}`} />
      {meta.label}
    </Badge>
  );
}

function DeploymentSkeleton() {
  return (
    <div className="divide-y divide-border" data-testid="loading-deployments">
      {[1, 2, 3, 4, 5].map((row) => (
        <div key={row} className="flex items-center gap-4 px-5 py-4">
          <div className="h-8 w-8 animate-pulse rounded-lg bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-2.5 w-1/4 animate-pulse rounded bg-muted" />
          </div>
          <div className="hidden h-6 w-20 animate-pulse rounded-full bg-muted sm:block" />
          <div className="h-3 w-24 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function DetailField({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-medium" title={title ?? value} data-testid={`detail-${label.toLowerCase().replace(/\s+/g, "-")}`}>
        {value}
      </p>
    </div>
  );
}

function DeploymentDetail({
  deploymentId,
  onClose,
}: {
  deploymentId: number;
  onClose: () => void;
}) {
  const { data, isLoading, isError, refetch } = useGetDeployment(deploymentId, {
    query: {
      enabled: deploymentId > 0,
      queryKey: getGetDeploymentQueryKey(deploymentId),
    },
  });

  return (
    <Card className="h-fit overflow-hidden border-primary/20 shadow-none" data-testid="deployment-detail-panel">
      <CardHeader className="border-b border-border bg-primary/[0.035] px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">Deployment record</p>
            <CardTitle className="mt-1 text-lg">Inspect change</CardTitle>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close deployment details" data-testid="button-close-deployment-detail">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 p-5">
        {isLoading && (
          <div className="space-y-4" data-testid="loading-deployment-detail">
            <div className="h-16 animate-pulse rounded-xl bg-muted" />
            <div className="grid grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((item) => <div key={item} className="h-12 animate-pulse rounded-lg bg-muted" />)}
            </div>
          </div>
        )}
        {isError && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4" data-testid="error-deployment-detail">
            <p className="text-sm font-semibold text-destructive">Deployment details unavailable</p>
            <p className="mt-1 text-xs text-muted-foreground">The list is still available. Try loading this record again.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-3" data-testid="button-retry-deployment-detail">
              <RefreshCw className="mr-2 h-3.5 w-3.5" /> Retry
            </Button>
          </div>
        )}
        {data && (
          <>
            <div className="rounded-xl border border-border bg-muted/35 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-2.5 text-primary"><PackageCheck className="h-5 w-5" /></div>
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold" title={data.summary || data.providerDeploymentId}>
                      {data.summary || "Production deployment"}
                    </p>
                    <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground" title={data.providerDeploymentId}>
                      {data.providerDeploymentId}
                    </p>
                  </div>
                </div>
                {statusBadge(data.status)}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-5">
              <DetailField label="System" value={data.systemName || data.systemKey} />
              <DetailField label="Environment" value={data.environment || "—"} />
              <DetailField label="Provider" value={data.provider || "—"} />
              <DetailField label="Deployer" value={data.deployerName || "Unattributed"} />
              <DetailField label="Branch" value={data.refName || "—"} title={data.refName || undefined} />
              <DetailField label="Commit" value={shortSha(data.commitSha)} title={data.commitSha || undefined} />
              <DetailField label="Release tag" value={data.releaseTag || "—"} title={data.releaseTag || undefined} />
              <DetailField label="Duration" value={formatDuration(data.durationMs)} />
              <DetailField label="Started" value={formatDate(data.startedAt)} />
              <DetailField label="Completed" value={formatDate(data.completedAt)} />
              <DetailField label="Deployed" value={formatDate(data.deployedAt)} />
              <DetailField label="Pipeline ID" value={data.pipelineId || "—"} title={data.pipelineId || undefined} />
            </div>
            {data.pipelineUrl && (
              <a
                href={data.pipelineUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
                data-testid="link-open-pipeline"
              >
                Open pipeline <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function WebhookSetup({ systems }: { systems?: DeploymentSystem[] }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const rotateSecret = useRotateDeploymentSystemSecret();
  const [visibleSecret, setVisibleSecret] = useState<{ name: string; value: string } | null>(null);
  const [copied, setCopied] = useState(false);

  if (!user || (user.role !== "admin" && user.role !== "editor")) return null;

  const rotate = async (systemId: number, name: string) => {
    try {
      const result = await rotateSecret.mutateAsync({ systemId });
      setVisibleSecret({ name, value: result.webhookSecret });
      setCopied(false);
      toast({
        title: "Webhook secret generated",
        description: "Copy it into the matching GitLab project webhook now. It will not be shown again.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not generate secret",
        description: error instanceof Error ? error.message : "Try again.",
      });
    }
  };

  const copySecret = async () => {
    if (!visibleSecret) return;
    await navigator.clipboard.writeText(visibleSecret.value);
    setCopied(true);
    toast({ title: "Copied", description: "The webhook secret is ready to paste into GitLab." });
  };

  return (
    <Card className="rounded-xl border-primary/15 shadow-none">
      <CardHeader className="border-b border-border px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary"><KeyRound className="h-4 w-4" /></div>
          <div>
            <CardTitle className="text-base">GitLab webhook setup</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Generate a secret for each GitLab project that should report deployments to Monit.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-5">
        {(systems ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No deployment systems are configured yet.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {(systems ?? []).map((system) => (
              <div key={system.id} className="rounded-xl border border-border bg-muted/20 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{system.name}</p>
                    <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">{system.systemKey}</p>
                  </div>
                  <span className={`whitespace-nowrap text-[10px] font-semibold ${system.lastWebhookAt ? "text-success" : "text-muted-foreground"}`}>
                    {system.lastWebhookAt ? "Receiving" : "Not connected"}
                  </span>
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground">
                  POST <span className="font-mono">/api/webhooks/gitlab/{system.systemKey}</span>
                </p>
                {user.role === "admin" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full"
                    onClick={() => rotate(system.id, system.name)}
                    disabled={rotateSecret.isPending}
                  >
                    <KeyRound className="mr-2 h-3.5 w-3.5" />
                    {rotateSecret.isPending ? "Generating..." : system.lastWebhookAt ? "Rotate secret" : "Generate secret"}
                  </Button>
                ) : (
                  <p className="mt-3 text-[10px] text-muted-foreground">Ask an administrator to generate the webhook secret.</p>
                )}
              </div>
            ))}
          </div>
        )}
        {visibleSecret && (
          <div className="rounded-xl border border-warning/30 bg-warning/10 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-warning-foreground">Secret for {visibleSecret.name}</p>
                <p className="mt-1 break-all font-mono text-xs text-foreground">{visibleSecret.value}</p>
              </div>
              <Button variant="secondary" size="sm" onClick={copySecret} className="shrink-0">
                {copied ? <Check className="mr-2 h-3.5 w-3.5 text-success" /> : <Copy className="mr-2 h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy secret"}
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-warning-foreground/80">
              This value is shown once. If it is lost, rotate it again before configuring GitLab.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Deployments() {
  const [system, setSystem] = useState("");
  const [environment, setEnvironment] = useState("");
  const [status, setStatus] = useState("");
  const [branch, setBranch] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const limit = 20;

  const { data: systems, isLoading: systemsLoading, isError: systemsError } = useListDeploymentSystems({
    query: {
      queryKey: getListDeploymentSystemsQueryKey(),
      staleTime: 60000,
    },
  });

  const params = useMemo<ListDeploymentsParams>(() => ({
    ...(system ? { system } : {}),
    ...(environment ? { environment } : {}),
    ...(status ? { status: status as ListDeploymentsParams["status"] } : {}),
    ...(branch.trim() ? { branch: branch.trim() } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    page,
    limit,
  }), [branch, environment, from, page, search, status, system, to]);

  const {
    data,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useListDeployments(params, {
    query: {
      queryKey: getListDeploymentsQueryKey(params),
      placeholderData: (previous) => previous,
      refetchInterval: 30000,
    },
  });

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / limit));
  const summary = data?.summary;
  const rows = data?.items ?? [];

  const clearFilters = () => {
    setSystem("");
    setEnvironment("");
    setStatus("");
    setBranch("");
    setSearch("");
    setFrom("");
    setTo("");
    setPage(1);
  };

  const applyQuickRange = (days: number) => {
    const start = new Date();
    start.setDate(start.getDate() - days);
    setFrom(start.toISOString().slice(0, 10));
    setTo(new Date().toISOString().slice(0, 10));
    setPage(1);
  };

  const selectDeployment = (deployment: Deployment) => setSelectedId(deployment.id);

  return (
    <div className="mx-auto max-w-[1600px] space-y-5" data-testid="page-deployments">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><GitCommitHorizontal className="h-6 w-6" /></div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Monit / operations</p>
              <h1 className="text-3xl font-bold tracking-tight">Deployments</h1>
            </div>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Review production changes across Magento, Odoo, and Phone Server.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-success" /></span>
          Live feed · refreshes every 30s
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh-deployments">
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Total changes", value: summary?.total, icon: PackageCheck, tone: "text-foreground", surface: "bg-muted/45" },
          { label: "Successful", value: summary?.successful, icon: CircleCheck, tone: "text-success", surface: "bg-success/8" },
          { label: "Failed", value: summary?.failed, icon: CircleX, tone: "text-destructive", surface: "bg-destructive/7" },
          { label: "Running", value: summary?.running, icon: CircleDashed, tone: "text-primary", surface: "bg-primary/8" },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="rounded-xl shadow-none">
              <CardContent className="flex items-center gap-3 p-4">
                <div className={`rounded-lg p-2 ${stat.surface} ${stat.tone}`}><Icon className="h-4 w-4" /></div>
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-medium text-muted-foreground">{stat.label}</p>
                  <p className={`mt-0.5 text-xl font-bold tabular-nums ${stat.tone}`} data-testid={`summary-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>
                    {summary ? (stat.value ?? 0).toLocaleString() : "—"}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="rounded-xl shadow-none">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Filter changes</p>
            </div>
            <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-deployment-filters">Clear filters</Button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <label className="space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">System</span>
              <select value={system} onChange={(event) => { setSystem(event.target.value); setPage(1); }} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" data-testid="select-deployment-system">
                <option value="">{systemsLoading ? "Loading systems..." : "All systems"}</option>
                {(systems ?? []).map((item) => <option key={item.id} value={item.systemKey}>{item.name}</option>)}
              </select>
              {systemsError && <span className="text-[10px] text-warning">Systems unavailable</span>}
            </label>
            <label className="space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Environment</span>
              <select value={environment} onChange={(event) => { setEnvironment(event.target.value); setPage(1); }} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" data-testid="select-deployment-environment">
                <option value="">All environments</option><option value="production">Production</option><option value="staging">Staging</option><option value="development">Development</option>
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Status</span>
              <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" data-testid="select-deployment-status">
                <option value="">All statuses</option>{Object.entries(statusMeta).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Branch</span>
              <Input value={branch} onChange={(event) => { setBranch(event.target.value); setPage(1); }} placeholder="main, release..." data-testid="input-deployment-branch" />
            </label>
            <label className="space-y-1.5 sm:col-span-2 lg:col-span-2 xl:col-span-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Search</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Summary, commit, deployer, pipeline ID..." className="pl-9" data-testid="input-deployment-search" />
              </div>
            </label>
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Date range</span>
              <div className="flex gap-1.5">
                <Input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} aria-label="From date" className="min-w-0 px-2 text-xs" data-testid="input-deployment-from" />
                <Input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} aria-label="To date" className="min-w-0 px-2 text-xs" data-testid="input-deployment-to" />
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <span className="mr-1 text-[11px] text-muted-foreground">Quick range</span>
            {[7, 30, 90].map((days) => <Button key={days} variant="secondary" size="sm" onClick={() => applyQuickRange(days)} data-testid={`button-deployment-range-${days}`}>Last {days}d</Button>)}
            {summary?.lastProductionAt && <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground"><Timer className="h-3.5 w-3.5" /> Last production {formatDate(summary.lastProductionAt, true)}</span>}
          </div>
        </CardContent>
      </Card>

      <WebhookSetup systems={systems} />

      {isError && (
        <Card className="border-destructive/25 bg-destructive/[0.03] shadow-none" data-testid="error-deployments">
          <CardContent className="flex flex-col items-start justify-between gap-3 p-5 sm:flex-row sm:items-center">
            <div><p className="font-semibold text-destructive">Deployment history unavailable</p><p className="mt-1 text-sm text-muted-foreground">Check the connection and try again. Filters are preserved.</p></div>
            <Button variant="outline" onClick={() => refetch()} data-testid="button-retry-deployments"><RefreshCw className="mr-2 h-4 w-4" /> Retry</Button>
          </CardContent>
        </Card>
      )}

      <div className={selectedId ? "grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]" : ""}>
        <Card className="overflow-hidden rounded-xl shadow-none" data-testid="deployment-history">
          <CardHeader className="flex-row items-center justify-between border-b border-border px-5 py-4">
            <div><CardTitle className="text-base">Change history</CardTitle><p className="mt-1 text-xs text-muted-foreground">{data ? `${data.total.toLocaleString()} records match the current view` : "Loading production records..."}</p></div>
            {isFetching && !isLoading && <LoaderCircle className="h-4 w-4 animate-spin text-muted-foreground" data-testid="status-deployments-refreshing" />}
          </CardHeader>
          {isLoading ? <DeploymentSkeleton /> : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center" data-testid="empty-deployments">
              <div className="rounded-2xl bg-muted p-4 text-muted-foreground"><Search className="h-6 w-6" /></div>
              <h3 className="mt-4 font-semibold">No deployments found</h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">No production changes match these filters. Clear the view to see the full feed.</p>
              <Button variant="outline" size="sm" onClick={clearFilters} className="mt-4" data-testid="button-empty-clear-filters">Clear filters</Button>
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/35 text-[10px] uppercase tracking-[0.12em] text-muted-foreground"><tr><th className="px-5 py-3 font-semibold">Change</th><th className="px-3 py-3 font-semibold">System</th><th className="px-3 py-3 font-semibold">Status</th><th className="px-3 py-3 font-semibold">Duration</th><th className="px-5 py-3 text-right font-semibold">Deployed</th></tr></thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((item) => (
                      <tr key={item.id} tabIndex={0} role="button" onClick={() => selectDeployment(item)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") selectDeployment(item); }} className={`cursor-pointer transition-colors hover:bg-muted/35 focus-visible:bg-muted/35 focus-visible:outline-none ${selectedId === item.id ? "bg-primary/[0.055]" : ""}`} data-testid={`row-deployment-${item.id}`}>
                        <td className="max-w-[340px] px-5 py-4"><div className="flex min-w-0 items-start gap-3"><div className="mt-0.5 rounded-lg bg-muted p-2 text-muted-foreground"><GitBranch className="h-4 w-4" /></div><div className="min-w-0"><p className="truncate font-semibold" title={item.summary || ""}>{item.summary || "Deployment without summary"}</p><p className="mt-1 flex items-center gap-2 truncate font-mono text-[11px] text-muted-foreground" title={item.commitSha || item.providerDeploymentId}><span>{shortSha(item.commitSha)}</span><span className="text-border">/</span><span className="truncate">{item.refName || "unknown ref"}</span></p></div></div></td>
                        <td className="px-3 py-4"><p className="max-w-[150px] truncate font-medium" title={item.systemName}>{item.systemName}</p><p className="mt-1 text-[11px] text-muted-foreground">{item.environment || "—"} · {item.provider || "—"}</p></td>
                        <td className="px-3 py-4">{statusBadge(item.status)}</td>
                        <td className="whitespace-nowrap px-3 py-4 font-mono text-xs text-muted-foreground">{formatDuration(item.durationMs)}</td>
                        <td className="whitespace-nowrap px-5 py-4 text-right"><p className="text-xs font-medium">{formatDate(item.deployedAt, true)}</p><p className="mt-1 text-[11px] text-muted-foreground">{item.deployerName || "Unattributed"}</p></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="divide-y divide-border md:hidden">
                {rows.map((item) => (
                  <button type="button" key={item.id} onClick={() => selectDeployment(item)} className={`block w-full p-4 text-left transition-colors hover:bg-muted/35 ${selectedId === item.id ? "bg-primary/[0.055]" : ""}`} data-testid={`card-deployment-${item.id}`}>
                    <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><div className="rounded-lg bg-muted p-2 text-muted-foreground"><GitBranch className="h-4 w-4" /></div><div className="min-w-0"><p className="truncate text-sm font-semibold" title={item.summary || ""}>{item.summary || "Deployment without summary"}</p><p className="mt-1 truncate font-mono text-[11px] text-muted-foreground" title={item.commitSha || ""}>{shortSha(item.commitSha)} · {item.refName || "unknown ref"}</p></div></div>{statusBadge(item.status)}</div>
                    <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground"><span className="truncate">{item.systemName} · {item.environment || "—"}</span><span className="whitespace-nowrap">{formatDate(item.deployedAt, true)}</span></div>
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-border px-5 py-3">
                <p className="text-xs text-muted-foreground">Page <span className="font-semibold text-foreground">{data?.page ?? page}</span> of <span className="font-semibold text-foreground">{totalPages}</span></p>
                <div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} data-testid="button-deployments-previous">Previous</Button><Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} data-testid="button-deployments-next">Next</Button></div>
              </div>
            </>
          )}
        </Card>
        {selectedId && <DeploymentDetail deploymentId={selectedId} onClose={() => setSelectedId(null)} />}
      </div>
    </div>
  );
}