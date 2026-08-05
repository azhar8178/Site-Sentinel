import { useState } from "react";
import { useListAlerts, useAnalyzeAlertIncident } from "@workspace/api-client-react";
import type { AlertResponse } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertCircle, ServerCrash, CheckCircle, Clock, Zap, Database, Activity,
  BrainCircuit, Loader2, ServerOff, ShieldCheck, GitBranch, GitCommitHorizontal,
  ExternalLink, RefreshCw,
} from "lucide-react";
import { format } from "date-fns";

function IncidentAnalysisDialog({
  alert,
  open,
  onClose,
}: {
  alert: AlertResponse | null;
  open: boolean;
  onClose: () => void;
}) {
  const { mutate, data, isPending, error, reset } = useAnalyzeAlertIncident();

  function handleAnalyze() {
    if (!alert) return;
    reset();
    mutate({ alertId: alert.id });
  }

  // Auto-trigger when dialog opens
  const [triggeredFor, setTriggeredFor] = useState<number | null>(null);
  if (open && alert && triggeredFor !== alert.id && !isPending && !data) {
    setTriggeredFor(alert.id);
    mutate({ alertId: alert.id });
  }

  const analysisText = data?.analysis ?? "";

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          reset();
          setTriggeredFor(null);
        }
      }}
    >
      <DialogContent className="max-w-2xl w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BrainCircuit className="w-5 h-5 text-primary" />
            Incident Analysis
          </DialogTitle>
        </DialogHeader>

        {alert && (
          <div className="mb-3 flex flex-wrap gap-2 items-center text-sm">
            <Badge variant="outline" className="font-mono">
              {alert.alertType.replace(/_/g, " ").toUpperCase()}
            </Badge>
            {alert.serverName && (
              <Badge variant="secondary">{alert.serverName}</Badge>
            )}
            <span className="text-muted-foreground">
              {format(new Date(alert.createdAt), "MMM d, yyyy HH:mm:ss")}
            </span>
          </div>
        )}

        {isPending && (
          <div className="flex items-center justify-center gap-3 py-12 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Analyzing incident timeline…</span>
          </div>
        )}

        {error && !isPending && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive space-y-3">
            <p>Analysis failed. {String(error)}</p>
            <Button size="sm" variant="outline" onClick={handleAnalyze}>
              Retry
            </Button>
          </div>
        )}

        {analysisText && !isPending && (
          <>
            <ScrollArea className="max-h-[60vh] rounded-md border bg-muted/30 p-4">
              <MarkdownPreview text={analysisText} />
            </ScrollArea>
            {data && (
              <p className="text-xs text-muted-foreground mt-1">
                Generated at {format(new Date(data.generatedAt), "HH:mm:ss")} ·{" "}
                {data.metricsCount} metric{data.metricsCount !== 1 ? "s" : ""} · {data.snapshotCount} log snapshot
                {data.snapshotCount !== 1 ? "s" : ""}
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Lightweight markdown renderer — handles headings, bold, code, and paragraphs */
function MarkdownPreview({ text }: { text: string }) {
  const lines = text.split("\n");

  return (
    <div className="space-y-1 text-sm leading-relaxed">
      {lines.map((line, i) => {
        if (/^#{1}\s/.test(line)) {
          return (
            <h2 key={i} className="text-base font-bold mt-4 mb-1 first:mt-0">
              {line.replace(/^#+\s/, "")}
            </h2>
          );
        }
        if (/^#{2,3}\s/.test(line)) {
          return (
            <h3 key={i} className="text-sm font-semibold mt-3 mb-1 text-foreground/80">
              {line.replace(/^#+\s/, "")}
            </h3>
          );
        }
        if (/^[-*]\s/.test(line)) {
          return (
            <div key={i} className="flex gap-2 ml-2">
              <span className="text-muted-foreground mt-0.5 shrink-0">•</span>
              <span>{renderInline(line.replace(/^[-*]\s/, ""))}</span>
            </div>
          );
        }
        if (line.trim() === "") {
          return <div key={i} className="h-1" />;
        }
        return (
          <p key={i} className="text-foreground/90">
            {renderInline(line)}
          </p>
        );
      })}
    </div>
  );
}

function renderInline(text: string) {
  // Bold **text** and inline `code`
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="bg-muted px-1 py-0.5 rounded text-xs font-mono">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

const SERVER_ALERT_TYPES = new Set([
  "cpu_high",
  "ram_high",
  "disk_high",
  "server_offline",
  "server_recovery",
]);

function getAlertConfig(type: string) {
  switch (type) {
    case "gitlab_push":
      return { icon: GitCommitHorizontal, color: "text-primary", bg: "bg-primary/10" };
    case "gitlab_deployment":
      return { icon: GitBranch, color: "text-violet-600", bg: "bg-violet-500/10" };
    case "downtime":
      return { icon: ServerCrash, color: "text-destructive", bg: "bg-destructive/10" };
    case "recovery":
      return { icon: CheckCircle, color: "text-success", bg: "bg-success/10" };
    case "slow_response":
      return { icon: Clock, color: "text-warning", bg: "bg-warning/10" };
    case "cpu_high":
      return { icon: Zap, color: "text-destructive", bg: "bg-destructive/10" };
    case "ram_high":
      return { icon: Activity, color: "text-warning", bg: "bg-warning/10" };
    case "disk_high":
      return { icon: Database, color: "text-destructive", bg: "bg-destructive/10" };
    case "server_offline":
      return { icon: ServerOff, color: "text-destructive", bg: "bg-destructive/10" };
    case "server_recovery":
      return { icon: ShieldCheck, color: "text-success", bg: "bg-success/10" };
    default:
      return { icon: AlertCircle, color: "text-primary", bg: "bg-primary/10" };
  }
}

export default function Alerts() {
  const { user, logout } = useAuth();
  const { data, error, isLoading, isError, refetch, isRefetching } = useListAlerts({ limit: 50 });
  const [selectedAlert, setSelectedAlert] = useState<AlertResponse | null>(null);
  const isUnauthorized = error && "status" in error && error.status === 401;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Alert Feed</h1>
          <p className="text-muted-foreground mt-1">Monitoring incidents, GitLab pushes, and deployment events</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {isError && (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-5 text-sm text-destructive">
          <p>
            {isUnauthorized
              ? "Your session has expired. Sign in again to load the alert feed."
              : "Could not load the alert feed. Try refreshing the page."}
          </p>
          <div className="mt-3 flex gap-2">
            {isUnauthorized && (
              <Button size="sm" variant="outline" onClick={logout}>
                Sign in again
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isRefetching}>
              Retry
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center gap-3 rounded-2xl border border-border bg-card py-16 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading alert feed…
        </div>
      ) : data?.alerts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-3 font-semibold">No events yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitoring alerts and GitLab webhook activity will appear here chronologically.
          </p>
        </div>
      ) : (
        <div className="relative space-y-4 before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
        {data?.alerts.map((alert) => {
          const config = getAlertConfig(alert.alertType);
          const Icon = config.icon;
          const isServerAlert = SERVER_ALERT_TYPES.has(alert.alertType);
          const isGitlab = alert.source === "gitlab";
          const statusLabel = alert.deploymentStatusLabel || (alert.deploymentStatus ?? "").replace(/_/g, " ");

          return (
            <div
              key={`${alert.source}-${alert.id}`}
              className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active"
            >
              <div
                className={`flex items-center justify-center w-10 h-10 rounded-full border-4 border-white shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm ${config.bg} ${config.color} z-10`}
              >
                <Icon className="w-4 h-4" />
              </div>

              <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-2xl border bg-card shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`font-semibold text-sm uppercase tracking-wider font-display ${isGitlab ? config.color : "text-primary"}`}>
                      {isGitlab
                        ? alert.alertType === "gitlab_push" ? "Code pushed" : "Deployment"
                        : alert.alertType.replace(/_/g, " ")}
                    </span>
                    {isGitlab && (
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                        GitLab
                      </Badge>
                    )}
                  </div>
                  <time className="text-xs text-muted-foreground font-medium bg-muted px-2 py-1 rounded-md">
                    {format(new Date(alert.createdAt), "MMM d, HH:mm:ss")}
                  </time>
                </div>

                <p className="text-foreground text-sm mb-3 whitespace-pre-line">
                  {isGitlab ? (alert.commitTitle || alert.summary || alert.message) : alert.message}
                </p>

                {isGitlab && alert.commitMessage && alert.commitMessage !== alert.commitTitle && (
                  <p className="mb-3 line-clamp-3 text-xs leading-5 text-muted-foreground">
                    {alert.commitMessage}
                  </p>
                )}

                <div className="flex gap-2 flex-wrap items-center">
                  {isGitlab && alert.systemName && (
                    <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                      {alert.systemName} · {alert.environment || "production"}
                    </span>
                  )}
                  {isGitlab && statusLabel && (
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      alert.deploymentStatus === "successful" ? "bg-success/10 text-success" :
                        alert.deploymentStatus === "failed" ? "bg-destructive/10 text-destructive" :
                          alert.deploymentStatus === "running" ? "bg-warning/10 text-warning-foreground" :
                            "bg-muted text-muted-foreground"
                    }`}>
                      {statusLabel}
                    </span>
                  )}
                  {isGitlab && alert.refName && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-mono text-muted-foreground">
                      <GitBranch className="h-3 w-3" />
                      {alert.refName.replace(/^refs\/heads\//, "")}
                    </span>
                  )}
                  {isGitlab && alert.commitSha && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-mono text-muted-foreground">
                      <GitCommitHorizontal className="h-3 w-3" />
                      {alert.commitSha.slice(0, 8)}
                    </span>
                  )}
                  {alert.siteName && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                      Site: {alert.siteName}
                    </span>
                  )}
                  {alert.serverName && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                      Server: {alert.serverName}
                    </span>
                  )}
                  {alert.statusCode && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono bg-slate-100 text-slate-600">
                      HTTP {alert.statusCode}
                    </span>
                  )}
                  {isServerAlert && alert.hasTimeline && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-auto gap-1.5 h-7 px-2.5 text-xs"
                      onClick={() => setSelectedAlert(alert)}
                    >
                      <BrainCircuit className="w-3.5 h-3.5" />
                      Analyze
                    </Button>
                  )}
                  {isGitlab && (alert.commitUrl || alert.projectUrl || alert.pipelineUrl) && (
                    <div className="ml-auto flex items-center gap-2">
                      {alert.commitUrl && (
                        <a href={alert.commitUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                          Commit <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {!alert.commitUrl && alert.projectUrl && (
                        <a href={alert.projectUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                          Project <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {alert.pipelineUrl && alert.pipelineUrl !== alert.projectUrl && (
                        <a href={alert.pipelineUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                          Pipeline <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        </div>
      )}

      <IncidentAnalysisDialog
        alert={selectedAlert}
        open={selectedAlert != null}
        onClose={() => setSelectedAlert(null)}
      />
    </div>
  );
}
