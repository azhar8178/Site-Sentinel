import React from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { CheckCircle2, AlertTriangle, RefreshCw, Printer, Server } from "lucide-react";
import { Button } from "@/components/ui/button";

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
  const token = localStorage.getItem("sentinel_token");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${base}${url}`, { ...options, headers: { ...headers, ...(options?.headers ?? {}) } });
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
      httpConnectionCount: number | null;
    } | null;
    services: {
      phpFpm: { active: number; idle: number; total: number; maxChildren: number } | null;
      mysql: { threads: number; questions: number; slowQueries: number } | null;
      nginx: { isRunning: boolean; activeConnections: number | null; requests: number | null; waiting: number | null } | null;
      varnish: { isRunning: boolean; hitRate: number | null; cacheHits: number | null; cacheMisses: number | null; clientRequests: number | null } | null;
      elasticsearch: { isRunning: boolean; status: string | null; numberOfNodes: number | null; activeShards: number | null } | null;
      sslExpiry: { domain: string; expiresAt: string; daysRemaining: number; isExpired: boolean; isExpiringSoon: boolean }[] | null;
    } | null;
  }[];
}

function StatusDot({ ok, text }: { ok: boolean; text?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${ok ? "bg-emerald-500" : "bg-red-500"}`} />
      <span className={`text-sm font-medium ${ok ? "text-emerald-700" : "text-red-700"}`}>
        {text ?? (ok ? "Healthy" : "Unhealthy")}
      </span>
    </span>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{children}</h3>
      <div className="flex-1 border-t border-border" />
    </div>
  );
}

function ServerHealthDetail(server: HealthReport["servers"][number]) {
  if (!server.isOnline) return "Server offline";
  if (!server.metrics) return "Online — no metrics yet";
  const { cpuPercent, memPercent, diskPercent } = server.metrics;
  const issues = [];
  if (cpuPercent > 90) issues.push(`CPU ${cpuPercent}%`);
  if (memPercent !== null && memPercent > 90) issues.push(`RAM ${memPercent}%`);
  if (diskPercent !== null && diskPercent > 90) issues.push(`Disk ${diskPercent}%`);
  if (issues.length) return `High usage: ${issues.join(", ")}`;
  return `CPU ${cpuPercent}%, RAM ${memPercent ?? "?"}%, Disk ${diskPercent ?? "?"}%`;
}

function ServiceRow({
  label,
  ok,
  statusLabel,
  detail,
}: {
  label: string;
  ok: boolean | null;
  statusLabel: string;
  detail?: string | null;
}) {
  const dot = ok === null ? "bg-gray-300" : ok ? "bg-emerald-500" : "bg-red-500";
  const text = ok === null ? "text-gray-500" : ok ? "text-emerald-700" : "text-red-700";
  return (
    <tr className="border-b border-border/50 last:border-0">
      <td className="py-2.5 px-4 text-sm text-foreground font-medium w-1/4">{label}</td>
      <td className="py-2.5 px-4 w-1/4">
        <span className="inline-flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
          <span className={`text-sm font-medium ${text}`}>{statusLabel}</span>
        </span>
      </td>
      <td className="py-2.5 px-4 text-sm text-muted-foreground">{detail ?? "—"}</td>
    </tr>
  );
}

export default function HealthReport() {
  const { data, isLoading, refetch, isFetching } = useQuery<HealthReport>({
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
  const generatedAt = new Date(report.generatedAt);
  const companyName = report.companyName || "Love Furniture";

  const ieSites = report.sites.filter(s => s.url.includes(".ie") || s.name.toLowerCase().includes(" ie"));
  const ukSites = report.sites.filter(s => s.url.includes(".co.uk") || s.name.toLowerCase().includes(" uk"));

  const storeOf = (s: HealthReport["servers"][number]) => {
    const txt = (s.name + " " + s.hostname).toLowerCase();
    if (/\bie\b|\.ie\b|ireland/.test(txt)) return "ie";
    if (/\buk\b|\.uk\b|england|britain/.test(txt)) return "uk";
    return "shared";
  };
  const ieServers = report.servers.filter(s => storeOf(s) === "ie");
  const ukServers = report.servers.filter(s => storeOf(s) === "uk");
  const sharedServers = report.servers.filter(s => storeOf(s) === "shared");

  const sitesUp = report.sites.filter(s => s.currentStatus === "up").length;
  const serversOnline = report.servers.filter(s => s.isOnline).length;
  const allSsl = report.servers.flatMap(s => s.services?.sslExpiry ?? []);

  return (
    <div className="space-y-4 print:space-y-0">

      {/* Screen-only toolbar */}
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-3xl font-display font-bold">Health Report</h1>
          <p className="text-muted-foreground mt-1 text-sm">System-wide status summary · {format(generatedAt, "d MMM yyyy, HH:mm")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" onClick={() => window.print()} className="gap-2">
            <Printer className="w-4 h-4" />
            Print / PDF
          </Button>
        </div>
      </div>

      {/* Report document */}
      <div className="bg-card text-card-foreground rounded-2xl border shadow-sm print:shadow-none print:border-none print:rounded-none" id="health-report-doc">

        {/* ── Document header ── */}
        <div className="px-10 pt-10 pb-8 border-b border-border print:px-12 print:pt-12">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">System Health Report</p>
              <h1 className="text-3xl font-display font-bold text-foreground leading-tight">{companyName}</h1>
              <p className="text-sm text-muted-foreground mt-2">
                {format(generatedAt, "EEEE, d MMMM yyyy")} &nbsp;·&nbsp; {format(generatedAt, "HH:mm")} UTC
              </p>
            </div>
            <div className={`mt-1 flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold ${isOperational ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"}`}>
              {isOperational
                ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                : <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
              {isOperational ? "All Systems Operational" : "System Degraded"}
            </div>
          </div>

          {/* Summary row */}
          <div className="grid grid-cols-3 gap-px bg-border rounded-xl overflow-hidden mt-8 border border-border">
            {[
              { label: "Sites Monitored", value: `${sitesUp} / ${report.sites.length} online` },
              { label: "Servers Online", value: `${serversOnline} / ${report.servers.length} online` },
              { label: "SSL Domains", value: allSsl.length > 0 ? `${allSsl.filter(e => !e.isExpired && !e.isExpiringSoon).length} / ${allSsl.length} valid` : "Not tracked" },
            ].map(item => (
              <div key={item.label} className="bg-muted px-5 py-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{item.label}</p>
                <p className="text-base font-bold text-foreground mt-0.5">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Document body ── */}
        <div className="px-10 py-8 space-y-10 print:px-12">

          {/* Infrastructure — Servers */}
          {report.servers.length > 0 && (
            <section>
              <SectionHeader>Infrastructure</SectionHeader>
              <div className="space-y-6">
                {[
                  { servers: ieServers, label: "Love Furniture IE", badge: "EUR", badgeColor: "bg-green-50 text-green-700 border-green-200" },
                  { servers: ukServers, label: "Love Furniture UK", badge: "GBP", badgeColor: "bg-blue-50 text-blue-700 border-blue-200" },
                  { servers: sharedServers, label: "Shared Infrastructure", badge: "Both", badgeColor: "bg-gray-100 text-gray-600 border-gray-200" },
                ].filter(g => g.servers.length > 0).map(group => (
                  <div key={group.label}>
                    <div className="flex items-center gap-2 mb-3">
                      <Server className="w-4 h-4 text-gray-400" />
                      <span className="text-sm font-semibold text-gray-800">{group.label}</span>
                      <span className={`text-xs border px-2 py-0.5 rounded-full font-medium ${group.badgeColor}`}>{group.badge}</span>
                    </div>
                    <div className="border border-gray-100 rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-100">
                          <tr>
                            <th className="text-left px-5 py-3 font-medium text-gray-400 text-xs uppercase tracking-wide w-1/3">Server</th>
                            <th className="text-left px-5 py-3 font-medium text-gray-400 text-xs uppercase tracking-wide w-1/4">Status</th>
                            <th className="text-left px-5 py-3 font-medium text-gray-400 text-xs uppercase tracking-wide">Vitals</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {group.servers.map(server => (
                            <tr key={server.id} className="hover:bg-gray-50/50 transition-colors">
                              <td className="px-5 py-4">
                                <p className="font-semibold text-gray-900">{server.name}</p>
                                <p className="text-xs font-mono text-gray-400">{server.hostname}</p>
                              </td>
                              <td className="px-5 py-4">
                                <StatusDot ok={server.isOnline} text={server.isOnline ? "Online" : "Offline"} />
                              </td>
                              <td className="px-5 py-4 text-gray-500 text-xs">{ServerHealthDetail(server)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Services — per server */}
          {report.servers.filter(s => s.services).map(server => {
            const svc = server.services!;
            const nginxOk = svc.nginx ? svc.nginx.isRunning : null;
            const varnishOk = svc.varnish ? svc.varnish.isRunning : null;
            const esStatus = svc.elasticsearch?.status ?? null;
            const esOk = esStatus === "green" ? true : esStatus === "red" ? false : esStatus === "yellow" ? null : null;
            const phpOk = svc.phpFpm ? svc.phpFpm.total > 0 : null;
            const mysqlOk = svc.mysql ? true : null;
            const sslEntries = Array.isArray(svc.sslExpiry) ? svc.sslExpiry : [];
            const hasAnyService = svc.nginx !== null || svc.varnish !== null || svc.phpFpm !== null || svc.mysql !== null || svc.elasticsearch !== null;
            if (!hasAnyService && sslEntries.length === 0) return null;
            return (
              <section key={server.id}>
                <SectionHeader>Services — {server.name}</SectionHeader>

                {hasAnyService && (
                  <div className="border border-gray-100 rounded-xl overflow-hidden mb-4">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wide w-1/4">Service</th>
                          <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wide w-1/4">Status</th>
                          <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wide">Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {svc.nginx !== null && (
                          <ServiceRow
                            label="Nginx"
                            ok={nginxOk}
                            statusLabel={nginxOk ? "Running" : nginxOk === false ? "Down" : "Unknown"}
                            detail={[
                              svc.nginx?.activeConnections != null && `${svc.nginx.activeConnections} active connections`,
                              svc.nginx?.requests != null && `${svc.nginx.requests.toLocaleString()} total requests`,
                            ].filter(Boolean).join(" · ") || null}
                          />
                        )}
                        {svc.varnish !== null && (
                          <ServiceRow
                            label="Varnish"
                            ok={varnishOk}
                            statusLabel={varnishOk ? "Running" : varnishOk === false ? "Down" : "Not detected"}
                            detail={svc.varnish?.hitRate != null ? `${svc.varnish.hitRate}% cache hit rate · ${svc.varnish.clientRequests?.toLocaleString() ?? "?"} requests` : null}
                          />
                        )}
                        {svc.phpFpm !== null && (
                          <ServiceRow
                            label="PHP-FPM"
                            ok={phpOk}
                            statusLabel={phpOk ? "Active" : phpOk === false ? "No workers" : "Unknown"}
                            detail={svc.phpFpm ? `${svc.phpFpm.active} active / ${svc.phpFpm.total} total workers` : null}
                          />
                        )}
                        {svc.mysql !== null && (
                          <ServiceRow
                            label="MySQL / RDS"
                            ok={mysqlOk}
                            statusLabel="Connected"
                            detail={svc.mysql ? `${svc.mysql.threads} threads · ${svc.mysql.slowQueries || 0} slow queries` : null}
                          />
                        )}
                        {svc.elasticsearch !== null && (
                          <ServiceRow
                            label="Elasticsearch"
                            ok={esOk}
                            statusLabel={esStatus === "green" ? "Green" : esStatus === "yellow" ? "Yellow" : esStatus === "red" ? "Red — critical" : "Unknown"}
                            detail={svc.elasticsearch?.numberOfNodes != null ? `${svc.elasticsearch.numberOfNodes} node(s) · ${svc.elasticsearch.activeShards} active shards` : null}
                          />
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {sslEntries.length > 0 && (
                  <div className="border border-gray-100 rounded-xl overflow-hidden">
                    <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                      <span className="text-xs font-bold uppercase tracking-wide text-gray-400">SSL Certificates</span>
                    </div>
                    <table className="w-full text-sm">
                      <thead className="border-b border-gray-50">
                        <tr>
                          <th className="text-left px-4 py-2.5 font-medium text-gray-400 text-xs w-2/5">Domain</th>
                          <th className="text-left px-4 py-2.5 font-medium text-gray-400 text-xs w-1/4">Status</th>
                          <th className="text-left px-4 py-2.5 font-medium text-gray-400 text-xs">Expires</th>
                          <th className="text-right px-4 py-2.5 font-medium text-gray-400 text-xs">Days Left</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {sslEntries.map(e => {
                          const ok = !e.isExpired && !e.isExpiringSoon;
                          return (
                            <tr key={e.domain}>
                              <td className="px-4 py-3 font-mono text-xs text-gray-800">{e.domain}</td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${ok ? "text-emerald-700" : e.isExpiringSoon ? "text-amber-700" : "text-red-700"}`}>
                                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ok ? "bg-emerald-500" : e.isExpiringSoon ? "bg-amber-400" : "bg-red-500"}`} />
                                  {e.isExpired ? "Expired" : e.isExpiringSoon ? "Expiring soon" : "Valid"}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-500">
                                {new Date(e.expiresAt).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" })}
                              </td>
                              <td className={`px-4 py-3 text-right font-mono text-xs font-bold ${ok ? "text-emerald-700" : e.isExpiringSoon ? "text-amber-700" : "text-red-700"}`}>
                                {e.isExpired ? "Expired" : `${e.daysRemaining}d`}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}

          {/* Stores — IE */}
          <section>
            <SectionHeader>Love Furniture IE — Store Availability</SectionHeader>
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-5 py-3 font-medium text-gray-400 text-xs uppercase tracking-wide w-2/5">URL</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-400 text-xs uppercase tracking-wide w-1/4">Status</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-400 text-xs uppercase tracking-wide">Response Time</th>
                    <th className="text-right px-5 py-3 font-medium text-gray-400 text-xs uppercase tracking-wide">Last Checked</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(ieSites.length > 0 ? ieSites : report.sites.filter(s => !s.url.includes(".co.uk"))).map(site => (
                    <tr key={site.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-4 font-mono text-xs text-gray-800">{site.url.replace(/^https?:\/\//, "")}</td>
                      <td className="px-5 py-4">
                        <StatusDot
                          ok={site.currentStatus === "up"}
                          text={site.currentStatus === "up" ? "Live" : site.currentStatus === "slow" ? "Slow" : "Down"}
                        />
                      </td>
                      <td className="px-5 py-4 text-gray-600 font-mono text-xs">
                        {site.lastResponseTimeMs != null ? `${(site.lastResponseTimeMs / 1000).toFixed(2)}s` : "—"}
                      </td>
                      <td className="px-5 py-4 text-right text-gray-400 text-xs">
                        {site.lastCheckedAt ? format(new Date(site.lastCheckedAt), "HH:mm:ss") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Stores — UK */}
          <section>
            <SectionHeader>Love Furniture UK — Store Availability</SectionHeader>
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-5 py-3 font-medium text-gray-400 text-xs uppercase tracking-wide w-2/5">URL</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-400 text-xs uppercase tracking-wide w-1/4">Status</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-400 text-xs uppercase tracking-wide">Response Time</th>
                    <th className="text-right px-5 py-3 font-medium text-gray-400 text-xs uppercase tracking-wide">Last Checked</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(ukSites.length > 0 ? ukSites : report.sites.filter(s => s.url.includes(".co.uk"))).map(site => (
                    <tr key={site.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-4 font-mono text-xs text-gray-800">{site.url.replace(/^https?:\/\//, "")}</td>
                      <td className="px-5 py-4">
                        <StatusDot
                          ok={site.currentStatus === "up"}
                          text={site.currentStatus === "up" ? "Live" : site.currentStatus === "slow" ? "Slow" : "Down"}
                        />
                      </td>
                      <td className="px-5 py-4 text-gray-600 font-mono text-xs">
                        {site.lastResponseTimeMs != null ? `${(site.lastResponseTimeMs / 1000).toFixed(2)}s` : "—"}
                      </td>
                      <td className="px-5 py-4 text-right text-gray-400 text-xs">
                        {site.lastCheckedAt ? format(new Date(site.lastCheckedAt), "HH:mm:ss") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

        </div>

        {/* ── Document footer ── */}
        <div className="px-10 py-5 border-t border-gray-100 bg-gray-50/60 rounded-b-2xl print:rounded-none flex items-center justify-between">
          <p className="text-xs text-gray-400">
            Generated by <span className="font-semibold text-gray-600">Site Sentinel</span>
          </p>
          <p className="text-xs text-gray-400">
            {format(generatedAt, "PPpp")} · Confidential
          </p>
        </div>
      </div>

      {/* Print CSS — visibility approach works across all browsers and React trees */}
      <style>{`
        @media print {
          @page { margin: 1.5cm; size: A4; }
          body * { visibility: hidden; }
          #health-report-doc,
          #health-report-doc * { visibility: visible; }
          #health-report-doc {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
          }
        }
      `}</style>
    </div>
  );
}
