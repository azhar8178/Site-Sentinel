import { useEffect, useMemo, useState } from "react";
import {
  getGetServerMetricsQueryKey,
  getGetServerWafEventsQueryKey,
  getListServersQueryKey,
  useGetServerMetrics,
  useGetServerWafEvents,
  useListServers,
} from "@workspace/api-client-react";
import { ShieldAlert, ShieldCheck, CircleAlert, CircleCheck, CircleX, Activity, Globe2, Bot, Route, ListFilter, BarChart3 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function statusIcon(running: boolean | undefined, label: string) {
  if (running === true) {
    return <span className="inline-flex items-center gap-1 text-xs font-medium text-success"><CircleCheck className="w-3.5 h-3.5" /> {label}</span>;
  }
  if (running === false) {
    return <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive"><CircleX className="w-3.5 h-3.5" /> Unavailable</span>;
  }
  return <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground"><CircleAlert className="w-3.5 h-3.5" /> No data</span>;
}

function formatNumber(value: unknown) {
  return Number(value ?? 0).toLocaleString();
}

function formatPercent(value: unknown) {
  const numeric = Number(value ?? 0);
  return `${numeric.toFixed(numeric % 1 ? 1 : 0)}%`;
}

function AnalyticsList({
  items,
  empty,
  formatName = (name: string) => name,
}: {
  items?: Array<{ name: string; hits: number }>;
  empty: string;
  formatName?: (name: string) => string;
}) {
  if (!items?.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  const max = Math.max(...items.map((item) => item.hits), 1);
  return (
    <div className="space-y-3">
      {items.slice(0, 6).map((item) => (
        <div key={item.name} className="space-y-1.5">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate" title={item.name}>{formatName(item.name)}</span>
            <span className="font-semibold tabular-nums">{formatNumber(item.hits)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary/75" style={{ width: `${Math.max(4, (item.hits / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Waf() {
  const { data: servers, isLoading: serversLoading } = useListServers({
    query: { refetchInterval: 30000, queryKey: getListServersQueryKey() },
  });
  const [selectedServerId, setSelectedServerId] = useState<number | null>(null);

  useEffect(() => {
    if (selectedServerId === null && servers?.length) setSelectedServerId(servers[0].id);
    if (selectedServerId !== null && servers && !servers.some((server) => server.id === selectedServerId)) {
      setSelectedServerId(servers[0]?.id ?? null);
    }
  }, [servers, selectedServerId]);

  const selectedServer = servers?.find((server) => server.id === selectedServerId);
  const { data: metrics, isLoading: metricsLoading } = useGetServerMetrics(selectedServerId ?? 0, { hours: 1 }, {
    query: {
      enabled: selectedServerId !== null,
      refetchInterval: 30000,
      queryKey: getGetServerMetricsQueryKey(selectedServerId ?? 0, { hours: 1 }),
    },
  });
  const { data: wafEvents, isLoading: eventsLoading } = useGetServerWafEvents(selectedServerId ?? 0, { hours: 24, limit: 200 }, {
    query: {
      enabled: selectedServerId !== null,
      refetchInterval: 300000,
      queryKey: getGetServerWafEventsQueryKey(selectedServerId ?? 0, { hours: 24, limit: 200 }),
    },
  });

  const latestWaf = useMemo(() => {
    const latest = metrics && metrics.length ? metrics[metrics.length - 1] : null;
    return (latest as any)?.waf ?? null;
  }, [metrics]);

  if (serversLoading) {
    return <div className="flex items-center justify-center py-24"><Activity className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-indigo-500/10 p-2.5 text-indigo-600"><ShieldCheck className="w-6 h-6" /></div>
            <h1 className="text-3xl font-display font-bold">AWS WAF</h1>
          </div>
          <p className="text-muted-foreground mt-2">Web ACL health, traffic intelligence, and redacted CloudWatch events from the last hour.</p>
        </div>
        <div className="min-w-[240px]">
          <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Protected server</label>
          <select
            value={selectedServerId ?? ""}
            onChange={(event) => setSelectedServerId(Number(event.target.value))}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
          >
            {(servers ?? []).map((server) => <option key={server.id} value={server.id}>{server.name} — {server.hostname}</option>)}
          </select>
        </div>
      </div>

      {!selectedServer && (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No monitored servers are configured.</CardContent></Card>
      )}

      {selectedServer && (
        <>
          <Card className="border-indigo-200/70 dark:border-indigo-900/60">
            <CardContent className="p-6">
              <div className="flex items-start justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-indigo-500/10 p-3 text-indigo-600">
                    {latestWaf?.status === "error" ? <ShieldAlert className="w-6 h-6" /> : <ShieldCheck className="w-6 h-6" />}
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">{latestWaf?.webAclName || "Web ACL traffic protection"}</h2>
                    <p className="text-sm text-muted-foreground">{selectedServer.name} · {selectedServer.hostname}</p>
                  </div>
                </div>
                {statusIcon(latestWaf?.isRunning, latestWaf?.status === "healthy" ? "Healthy" : latestWaf?.status === "warning" ? "Warning" : "WAF")}
              </div>

              {metricsLoading ? (
                <div className="py-10 flex justify-center"><Activity className="w-6 h-6 animate-spin text-primary" /></div>
              ) : latestWaf ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {[
                      { label: "Blocked", value: latestWaf.blocked ?? 0, tone: "text-destructive" },
                      { label: "Allowed", value: latestWaf.allowed ?? 0, tone: "text-success" },
                      { label: "Counted", value: latestWaf.count ?? 0, tone: "" },
                      { label: "Total events", value: latestWaf.total ?? 0, tone: "" },
                      { label: "Bot traffic", value: latestWaf.botTraffic?.bots ?? 0, tone: "text-amber-600" },
                    ].map((stat) => (
                      <div key={stat.label} className="rounded-xl bg-muted/40 p-4">
                        <p className="text-xs text-muted-foreground">{stat.label}</p>
                        <p className={`text-2xl font-bold mt-1 ${stat.tone}`}>{Number(stat.value).toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 text-sm">
                    <div className="rounded-xl border border-border bg-card p-4">
                      <p className="text-xs text-muted-foreground">Logging</p>
                      <p className="font-semibold mt-1">{latestWaf.loggingEnabled ? "Enabled" : "Unavailable"}</p>
                      <p className="text-xs text-muted-foreground mt-1 break-all">{latestWaf.logGroup || "—"}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-4">
                      <p className="text-xs text-muted-foreground">Protected resource</p>
                      <p className="font-semibold mt-1">{latestWaf.region || "—"}</p>
                      <p className="text-xs text-muted-foreground mt-1 break-all">{latestWaf.protectedResources?.[0] || "No association reported"}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                    <div className="rounded-xl border border-border bg-card p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Bot className="w-4 h-4 text-amber-600" />
                        <p className="text-sm font-semibold">Bot traffic</p>
                      </div>
                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <p className="text-2xl font-bold">{formatNumber(latestWaf.botTraffic?.bots)}</p>
                          <p className="text-xs text-muted-foreground">identified requests</p>
                        </div>
                        <Badge variant="secondary">{formatPercent(latestWaf.botTraffic?.rate)}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-3">
                        {formatNumber(latestWaf.botTraffic?.human)} requests not identified as bots
                      </p>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <BarChart3 className="w-4 h-4 text-primary" />
                        <p className="text-sm font-semibold">Traffic decisions</p>
                      </div>
                      <AnalyticsList items={latestWaf.actionBreakdown} empty="No decisions in this window." />
                    </div>
                    <div className="rounded-xl border border-border bg-card p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Bot className="w-4 h-4 text-amber-600" />
                        <p className="text-sm font-semibold">Bot types</p>
                      </div>
                      <AnalyticsList items={latestWaf.botTraffic?.topTypes} empty="No bot traffic identified." />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                    <div className="rounded-xl border border-border bg-card p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Globe2 className="w-4 h-4 text-primary" />
                        <p className="text-sm font-semibold">Top countries</p>
                      </div>
                      <AnalyticsList items={latestWaf.topCountries} empty="No country data in this window." />
                    </div>
                    <div className="rounded-xl border border-border bg-card p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Route className="w-4 h-4 text-primary" />
                        <p className="text-sm font-semibold">Top requested paths</p>
                      </div>
                      <AnalyticsList items={latestWaf.topPaths} empty="No request paths in this window." />
                    </div>
                  </div>
                  {(latestWaf.topRules?.length ?? 0) > 0 && (
                    <div className="mt-5">
                      <div className="flex items-center gap-2 mb-3">
                        <ListFilter className="w-4 h-4 text-primary" />
                        <p className="text-sm font-semibold">Top rules in the last hour</p>
                      </div>
                      <AnalyticsList
                        items={latestWaf.topRules.map((rule: any) => ({ name: rule.rule, hits: rule.hits }))}
                        empty="No rules matched."
                      />
                    </div>
                  )}
                  {latestWaf.error && <p className="text-sm text-warning mt-4">{latestWaf.error}</p>}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No AWS WAF telemetry has been reported yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-lg font-semibold">Recent WAF events</h2>
                  <p className="text-sm text-muted-foreground">Redacted events retained for 7 days · last 24 hours shown</p>
                </div>
                <Badge variant="outline">{wafEvents?.length ?? 0} shown</Badge>
              </div>
              {eventsLoading ? (
                <div className="py-10 flex justify-center"><Activity className="w-6 h-6 animate-spin text-primary" /></div>
              ) : wafEvents && wafEvents.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-3">Time</th><th className="pb-2 pr-3">Action</th><th className="pb-2 pr-3">Rule</th><th className="pb-2 pr-3">Source</th><th className="pb-2">Path</th>
                    </tr></thead>
                    <tbody>{wafEvents.slice(0, 100).map((event: any) => (
                      <tr key={event.id} className="border-b border-secondary">
                        <td className="py-2 pr-3 whitespace-nowrap">{new Date(event.eventAt).toLocaleString()}</td>
                        <td className={`py-2 pr-3 font-semibold ${event.action === "BLOCK" ? "text-destructive" : event.action === "ALLOW" ? "text-success" : ""}`}>{event.action}</td>
                        <td className="py-2 pr-3 max-w-[220px] truncate" title={event.rule || ""}>{event.rule || "—"}</td>
                        <td className="py-2 pr-3">{event.clientIp || "—"}{event.country ? ` (${event.country})` : ""}</td>
                        <td className="py-2 max-w-[260px] truncate" title={event.uri || ""}>{event.method ? `${event.method} ` : ""}{event.uri || "—"}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">No WAF events recorded in the selected window.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}