import { useState } from "react";
import { useListAlerts, useAnalyzeAlertIncident } from "@workspace/api-client-react";
import type { AlertResponse } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertCircle, ServerCrash, CheckCircle, Clock, Zap, Database, Activity, BrainCircuit, Loader2, ServerOff, ShieldCheck } from "lucide-react";
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
  const { data } = useListAlerts({ limit: 50 });
  const [selectedAlert, setSelectedAlert] = useState<AlertResponse | null>(null);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-display font-bold">Alert Feed</h1>
        <p className="text-muted-foreground mt-1">Chronological history of system events</p>
      </div>

      <div className="relative space-y-4 before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
        {data?.alerts.map((alert) => {
          const config = getAlertConfig(alert.alertType);
          const Icon = config.icon;
          const isServerAlert = SERVER_ALERT_TYPES.has(alert.alertType);

          return (
            <div
              key={alert.id}
              className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active"
            >
              <div
                className={`flex items-center justify-center w-10 h-10 rounded-full border-4 border-white shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm ${config.bg} ${config.color} z-10`}
              >
                <Icon className="w-4 h-4" />
              </div>

              <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-2xl border bg-white shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-sm text-primary uppercase tracking-wider font-display">
                    {alert.alertType.replace(/_/g, " ")}
                  </span>
                  <time className="text-xs text-muted-foreground font-medium bg-slate-50 px-2 py-1 rounded-md">
                    {format(new Date(alert.createdAt), "MMM d, HH:mm:ss")}
                  </time>
                </div>

                <p className="text-foreground text-sm mb-3">{alert.message}</p>

                <div className="flex gap-2 flex-wrap items-center">
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
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <IncidentAnalysisDialog
        alert={selectedAlert}
        open={selectedAlert != null}
        onClose={() => setSelectedAlert(null)}
      />
    </div>
  );
}
