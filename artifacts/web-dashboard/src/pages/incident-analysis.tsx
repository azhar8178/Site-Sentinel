import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  customFetch,
  getGetServerLogSnapshotsQueryKey,
  getListServersQueryKey,
  useListServers,
  useGetServerLogSnapshots,
  useAnalyzeServerIncident,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, BrainCircuit, ChevronDown, Download, FileText, Server, Sparkles } from "lucide-react";

export default function IncidentAnalysis() {
  const [location] = useLocation();
  const deepLink = useMemo(() => {
    const query = location.includes("?") ? location.slice(location.indexOf("?") + 1) : "";
    const params = new URLSearchParams(query);
    const requestedServerId = Number(params.get("serverId"));
    const requestedHours = Number(params.get("hours"));
    return {
      serverId: Number.isInteger(requestedServerId) && requestedServerId > 0 ? requestedServerId : null,
      hours: [1, 6, 24].includes(requestedHours) ? requestedHours : 6,
      focus: params.get("focus") === "meta" ? "meta" : null,
      error: params.get("error") || null,
    };
  }, [location]);
  const { data: servers, isLoading: serversLoading } = useListServers({
    query: {
      queryKey: getListServersQueryKey(),
      refetchInterval: 30000,
    },
  });
  const [selectedServerId, setSelectedServerId] = useState<number | null>(deepLink.serverId);
  const [hours, setHours] = useState(deepLink.hours);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(deepLink.focus === "meta");
  const [focusedError, setFocusedError] = useState<string | null>(deepLink.error);
  const [downloadingFormat, setDownloadingFormat] = useState<"json" | "csv" | "pdf" | null>(null);
  const { toast } = useToast();
  const analyzeIncident = useAnalyzeServerIncident();

  useEffect(() => {
    if (servers?.length && (selectedServerId === null || !servers.some(server => server.id === selectedServerId))) {
      const requestedServer = deepLink.serverId && servers.some(server => server.id === deepLink.serverId)
        ? deepLink.serverId
        : servers[0].id;
      setSelectedServerId(requestedServer);
    }
  }, [deepLink.serverId, selectedServerId, servers]);

  useEffect(() => {
    setFocusedError(deepLink.error);
    if (deepLink.focus === "meta") setShowLogs(true);
  }, [deepLink.error, deepLink.focus]);

  const selectedServer = servers?.find(server => server.id === selectedServerId);
  const { data: logSnapshots, isLoading: logsLoading } = useGetServerLogSnapshots(
    selectedServerId ?? 0,
    { hours },
    {
      query: {
        queryKey: getGetServerLogSnapshotsQueryKey(selectedServerId ?? 0, { hours }),
        enabled: selectedServerId !== null,
        refetchInterval: 300000,
      },
    },
  );
  const sourceCoverage = (["meta", "stripe"] as const).map(source => {
    const entries = (logSnapshots ?? []).flatMap(snapshot => {
      const value = snapshot.logs && typeof snapshot.logs === "object"
        ? (snapshot.logs as Record<string, unknown>).sources
        : null;
      const sources = value && typeof value === "object"
        ? value as Record<string, unknown>
        : {};
      const text = typeof sources[source] === "string"
        ? sources[source]
        : "";
      return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    });
    return {
      source,
      entryCount: entries.length,
      label: source === "meta" ? "Meta / Facebook feed" : "Stripe payments",
    };
  });

  const handleServerChange = (value: string) => {
    setSelectedServerId(Number(value));
    setAnalysis(null);
    setShowLogs(false);
    setFocusedError(null);
  };

  const handleAnalyze = async () => {
    if (selectedServerId === null) return;
    setAnalysis(null);
    try {
      const result = await analyzeIncident.mutateAsync({
        serverId: selectedServerId,
        data: { hours },
      });
      setAnalysis(result.analysis);
    } catch (error: any) {
      const rawData = error?.data;
      const providerRejected = typeof rawData === "string" && /<!doctype|<html|bad request/i.test(rawData);
      toast({
        variant: "destructive",
        title: "Analysis unavailable",
        description: providerRejected
          ? "The AI analysis service rejected the request. Try the 1h window or retry in a moment."
          : error?.data?.error || error?.message || "Could not analyze this incident.",
      });
    }
  };

  const downloadLogs = async (format: "json" | "csv" | "pdf") => {
    if (selectedServerId === null || !logSnapshots?.length || !selectedServer) return;
    setDownloadingFormat(format);
    try {
      const blob = await customFetch<Blob>(
        `/api/servers/${selectedServerId}/log-snapshots/export?hours=${Math.min(hours, 24)}&format=${format}`,
        { responseType: "blob" },
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${selectedServer.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || `server-${selectedServerId}`}-logs-${hours}h.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast({
        title: "Download ready",
        description: format === "pdf" ? "Management PDF report downloaded." : `${format.toUpperCase()} log export downloaded.`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Download failed",
        description: error?.data?.error || error?.message || "Could not export server logs.",
      });
    } finally {
      setDownloadingFormat(null);
    }
  };

  const isOnline = selectedServer?.lastSeenAt
    ? Date.now() - new Date(selectedServer.lastSeenAt).getTime() < 120000
    : false;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-display font-bold">Incident Analysis</h1>
            <p className="text-muted-foreground mt-1">
              Investigate server performance using sanitized logs and telemetry.
            </p>
          </div>
        </div>
        {deepLink.focus === "meta" && (
          <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-semibold text-primary">Meta / Facebook focus</span>
            {focusedError ? " · Showing the selected error context below." : " · Showing Meta evidence in the selected window."}
          </div>
        )}
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-5">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-5 items-end">
            <div>
              <label className="text-sm font-medium flex items-center gap-2 mb-2">
                <Server className="w-4 h-4 text-muted-foreground" />
                Server
              </label>
              <select
                value={selectedServerId !== null ? String(selectedServerId) : ""}
                onChange={event => handleServerChange(event.target.value)}
                disabled={serversLoading || !servers?.length}
                className="flex h-9 w-full items-center rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="" disabled>
                  {serversLoading ? "Loading servers…" : "Select a server"}
                </option>
                {(servers ?? []).map(server => (
                  <option key={server.id} value={String(server.id)}>
                    {server.name} · {server.hostname}
                  </option>
                ))}
              </select>
              {selectedServer && (
                <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                  <span className={`w-2 h-2 rounded-full ${isOnline ? "bg-success" : "bg-destructive"}`} />
                  {isOnline ? "Online" : "Offline or not reporting"}
                  {selectedServer.lastSeenAt && ` · Last seen ${new Date(selectedServer.lastSeenAt).toLocaleString()}`}
                </div>
              )}
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Analysis window</p>
              <div className="flex gap-2">
                {[1, 6, 24].map(windowHours => (
                  <button
                    key={windowHours}
                    type="button"
                    onClick={() => { setHours(windowHours); setAnalysis(null); setFocusedError(null); }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      hours === windowHours
                        ? "bg-primary text-primary-foreground"
                        : "bg-card text-muted-foreground hover:bg-secondary border border-border"
                    }`}
                  >
                    {windowHours}h
                  </button>
                ))}
              </div>
            </div>

            <Button
              onClick={handleAnalyze}
              disabled={selectedServerId === null || analyzeIncident.isPending}
              className="gap-2 lg:col-start-2"
            >
              <BrainCircuit className={`w-4 h-4 ${analyzeIncident.isPending ? "animate-pulse" : ""}`} />
              {analyzeIncident.isPending ? "Analyzing…" : `Analyze last ${hours}h`}
            </Button>
          </div>
        </CardContent>
      </Card>

      {!serversLoading && !servers?.length && (
        <Card>
          <CardContent className="py-14 text-center text-muted-foreground">
            <Server className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium text-foreground">No monitored servers</p>
            <p className="text-sm mt-1">Add a server and install its monitoring agent first.</p>
          </CardContent>
        </Card>
      )}

      {selectedServer && (
        <>
          {analysis && (
            <Card className="border-primary/20">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="rounded-lg bg-primary/10 p-2 text-primary">
                    <BrainCircuit className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-semibold">AI findings</h2>
                    <p className="text-xs text-muted-foreground">
                      {selectedServer.name} · Last {hours} hours
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAnalysis(null)}
                    className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                  >
                    Dismiss
                  </button>
                </div>
                <div className="text-sm leading-6 whitespace-pre-wrap text-foreground/90">
                  {analysis}
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border-border/80">
            <CardContent className="p-5">
              <div className="flex items-start gap-3 mb-4">
                <Sparkles className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <h2 className="font-semibold">AI evidence coverage</h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Source-specific sanitized log evidence supplied to the analysis.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {sourceCoverage.map(({ source, entryCount, label }) => (
                  <div key={source} className="rounded-lg border border-border bg-muted/20 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium">{label}</span>
                      <span className={`text-xs font-medium ${entryCount > 0 ? "text-success" : "text-muted-foreground"}`}>
                        {entryCount > 0 ? "Evidence captured" : "No entries captured"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {logsLoading
                        ? "Collecting sanitized snapshots…"
                        : `${entryCount} log entr${entryCount === 1 ? "y" : "ies"} in the last ${hours}h`}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <FileText className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div>
                    <h2 className="font-semibold">Collected performance logs</h2>
                    <p className="text-xs text-muted-foreground mt-1">
                      {logsLoading
                        ? "Loading sanitized snapshots…"
                        : `${logSnapshots?.length ?? 0} snapshot${logSnapshots?.length === 1 ? "" : "s"} from the last ${hours}h`}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowLogs(value => !value)}
                    disabled={!logSnapshots?.length}
                    className="gap-2"
                  >
                    {showLogs ? "Hide logs" : `View logs (${logSnapshots?.length ?? 0})`}
                    <ChevronDown className={`w-4 h-4 transition-transform ${showLogs ? "rotate-180" : ""}`} />
                  </Button>
                  {(["json", "csv", "pdf"] as const).map(format => (
                    <Button
                      key={format}
                      size="sm"
                      variant="outline"
                      onClick={() => downloadLogs(format)}
                      disabled={!logSnapshots?.length || downloadingFormat !== null}
                      className="gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      {downloadingFormat === format ? "Preparing…" : format === "pdf" ? "PDF report" : format.toUpperCase()}
                    </Button>
                  ))}
                </div>
              </div>

              {!logsLoading && !logSnapshots?.length && (
                <div className="flex items-start gap-3 mt-5 rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-warning" />
                  <p>No log snapshots are available for this window yet. The agent sends a sanitized snapshot every five minutes.</p>
                </div>
              )}

              {showLogs && logSnapshots && logSnapshots.length > 0 && (
                <div className="mt-5 space-y-3">
                  {logSnapshots.slice(-3).reverse().map((snapshot: any) => (
                    <div key={snapshot.id} className="rounded-lg border border-border bg-muted/20 p-3">
                      <p className="text-xs font-medium text-muted-foreground mb-2">
                        Snapshot {new Date(snapshot.recordedAt).toLocaleString()}
                      </p>
                      <div className="space-y-3">
                        {Object.entries(snapshot.logs?.sources ?? {})
                          .filter(([source, value]) => value && (!deepLink.focus || source === deepLink.focus))
                          .map(([source, value]) => (
                            <div key={source}>
                              <p className="text-xs font-semibold capitalize mb-1">
                                {source === "stripe" ? "Stripe payments" : source === "meta" ? "Meta / Facebook feed" : source}
                              </p>
                              <pre
                                className={`max-h-64 overflow-auto rounded bg-black/90 p-3 text-[10px] leading-4 whitespace-pre-wrap break-all ${
                                  focusedError && String(value).includes(focusedError)
                                    ? "text-green-100 ring-2 ring-primary ring-offset-2 ring-offset-background"
                                    : "text-green-200"
                                }`}
                                data-testid={focusedError && String(value).includes(focusedError) ? "focused-meta-log" : undefined}
                              >
                                {String(value)}
                              </pre>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}