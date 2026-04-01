import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CheckCircle2, AlertTriangle, RefreshCw, Printer, Server, Globe, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
  const token = localStorage.getItem("sentinel_token");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${base}${url}`, { ...options, headers: { ...headers, ...(options?.headers ?? {}) } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

interface Gateway {
  id: string;
  name: string;
  status: "active" | "inactive" | "maintenance";
  detail: string;
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
    } | null;
  }[];
  iePaymentGateways: Gateway[];
  ukPaymentGateways: Gateway[];
}

function StatusDot({ ok, text }: { ok: boolean; text?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block w-2.5 h-2.5 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"}`} />
      <span className={`text-sm font-medium ${ok ? "text-emerald-700" : "text-red-700"}`}>
        {text ?? (ok ? "Healthy" : "Unhealthy")}
      </span>
    </span>
  );
}

function GatewayStatusDot({ status }: { status: Gateway["status"] }) {
  const map = {
    active: { label: "Active", ok: true },
    inactive: { label: "Inactive", ok: false },
    maintenance: { label: "Maintenance", ok: false },
  };
  const { label, ok } = map[status] ?? { label: status, ok: false };
  return <StatusDot ok={ok} text={label} />;
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

function GatewayTable({ gateways }: { gateways: Gateway[] }) {
  if (gateways.length === 0) {
    return (
      <div className="border rounded-xl px-5 py-6 text-sm text-gray-400 text-center">
        No payment gateways configured. Add them in Settings → Health Report.
      </div>
    );
  }
  return (
    <div className="border rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="text-left px-5 py-3 font-medium text-gray-500 w-1/3">Gateway</th>
            <th className="text-left px-5 py-3 font-medium text-gray-500 w-1/4">Status</th>
            <th className="text-left px-5 py-3 font-medium text-gray-500">Detail</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {gateways.map((gw) => (
            <tr key={gw.id} className="hover:bg-gray-50/50 transition-colors">
              <td className="px-5 py-3.5 font-medium text-gray-900">{gw.name}</td>
              <td className="px-5 py-3.5"><GatewayStatusDot status={gw.status} /></td>
              <td className="px-5 py-3.5 text-gray-500">{gw.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function HealthReport() {
  const queryClient = useQueryClient();
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
  const generatedDate = format(new Date(report.generatedAt), "MMMM d, yyyy");
  const companyName = report.companyName || "Love Furniture";

  const ieSite = report.sites.find(s => s.url.includes(".ie") || s.name.toLowerCase().includes(" ie"));
  const ukSite = report.sites.find(s => s.url.includes(".co.uk") || s.name.toLowerCase().includes(" uk"));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Health Report</h1>
          <p className="text-muted-foreground mt-1">System-wide status summary for both stores</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching} className="gap-2 bg-white">
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" onClick={() => window.print()} className="gap-2 bg-white">
            <Printer className="w-4 h-4" />
            Print
          </Button>
        </div>
      </div>

      {/* Report Document */}
      <div className="bg-white rounded-2xl border shadow-sm print:shadow-none print:border-none" id="health-report-doc">
        {/* Document Header */}
        <div className="p-8 pb-6 border-b">
          <h2 className="text-2xl font-display font-bold text-gray-900">{companyName} — System Health Report</h2>
          <p className="text-gray-500 mt-1 text-sm">{generatedDate} — Post-Investigation Summary</p>
        </div>

        <div className="p-8 space-y-8">
          {/* Overall Status Banner */}
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${isOperational ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
            {isOperational
              ? <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              : <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />}
            <span className={`font-semibold text-sm ${isOperational ? "text-emerald-800" : "text-red-800"}`}>
              {isOperational
                ? "All Systems Operational"
                : `System Degraded — ${report.sites.filter(s => s.currentStatus !== "up").length} site(s) affected`}
            </span>
          </div>

          {/* Infrastructure (Servers) — split by store */}
          {report.servers.length > 0 && (() => {
            const storeOf = (s: HealthReport["servers"][number]) => {
              const txt = (s.name + " " + s.hostname).toLowerCase();
              if (/\bie\b|\.ie\b|ireland/.test(txt)) return "ie";
              if (/\buk\b|\.uk\b|england|britain/.test(txt)) return "uk";
              return "shared";
            };
            const ieServers = report.servers.filter(s => storeOf(s) === "ie");
            const ukServers = report.servers.filter(s => storeOf(s) === "uk");
            const sharedServers = report.servers.filter(s => storeOf(s) === "shared");

            const ServerTable = ({ servers, label, badge }: { servers: HealthReport["servers"]; label: string; badge?: React.ReactNode }) => (
              servers.length === 0 ? null : (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Server className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-semibold text-gray-800">{label}</span>
                    {badge}
                  </div>
                  <div className="border rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="text-left px-5 py-3 font-medium text-gray-500 w-1/3">Component</th>
                          <th className="text-left px-5 py-3 font-medium text-gray-500 w-1/4">Status</th>
                          <th className="text-left px-5 py-3 font-medium text-gray-500">Detail</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {servers.map(server => (
                          <tr key={server.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-5 py-3.5 font-medium text-gray-900">{server.name}</td>
                            <td className="px-5 py-3.5">
                              <StatusDot ok={server.isOnline} text={server.isOnline ? "Healthy" : "Offline"} />
                            </td>
                            <td className="px-5 py-3.5 text-gray-500">{ServerHealthDetail(server)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            );

            return (
              <section className="space-y-5">
                <h3 className="text-base font-semibold text-gray-900">Infrastructure</h3>
                <ServerTable
                  servers={ieServers}
                  label="Love Furniture IE"
                  badge={<span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium">EUR</span>}
                />
                <ServerTable
                  servers={ukServers}
                  label="Love Furniture UK"
                  badge={<span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium">GBP</span>}
                />
                <ServerTable
                  servers={sharedServers}
                  label="Shared Infrastructure"
                  badge={<span className="text-xs bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 rounded-full font-medium">Both Stores</span>}
                />
              </section>
            );
          })()}

          {/* Stores — IE */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Globe className="w-4 h-4 text-gray-400" />
              <h3 className="text-base font-semibold text-gray-900">Love Furniture IE</h3>
              <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium">EUR</span>
            </div>
            <div className="border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-5 py-3 font-medium text-gray-500 w-1/3">Store</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-500 w-1/4">Status</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-500">Response Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {ieSite ? (
                    <tr className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3.5">
                        <a href={ieSite.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                          {ieSite.url.replace(/^https?:\/\//, "")}
                        </a>
                      </td>
                      <td className="px-5 py-3.5">
                        <StatusDot
                          ok={ieSite.currentStatus === "up"}
                          text={ieSite.currentStatus === "up" ? "Live" : ieSite.currentStatus === "slow" ? "Slow" : "Down"}
                        />
                      </td>
                      <td className="px-5 py-3.5 text-gray-600 font-mono text-xs">
                        {ieSite.lastResponseTimeMs != null ? `${(ieSite.lastResponseTimeMs / 1000).toFixed(2)}s` : "—"}
                      </td>
                    </tr>
                  ) : report.sites.filter(s => !s.url.includes(".co.uk")).map(site => (
                    <tr key={site.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3.5">
                        <a href={site.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                          {site.url.replace(/^https?:\/\//, "")}
                        </a>
                      </td>
                      <td className="px-5 py-3.5">
                        <StatusDot
                          ok={site.currentStatus === "up"}
                          text={site.currentStatus === "up" ? "Live" : site.currentStatus === "slow" ? "Slow" : "Down"}
                        />
                      </td>
                      <td className="px-5 py-3.5 text-gray-600 font-mono text-xs">
                        {site.lastResponseTimeMs != null ? `${(site.lastResponseTimeMs / 1000).toFixed(2)}s` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Stores — UK */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Globe className="w-4 h-4 text-gray-400" />
              <h3 className="text-base font-semibold text-gray-900">Love Furniture UK</h3>
              <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium">GBP</span>
            </div>
            <div className="border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-5 py-3 font-medium text-gray-500 w-1/3">Store</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-500 w-1/4">Status</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-500">Response Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {ukSite ? (
                    <tr className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3.5">
                        <a href={ukSite.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                          {ukSite.url.replace(/^https?:\/\//, "")}
                        </a>
                      </td>
                      <td className="px-5 py-3.5">
                        <StatusDot
                          ok={ukSite.currentStatus === "up"}
                          text={ukSite.currentStatus === "up" ? "Live" : ukSite.currentStatus === "slow" ? "Slow" : "Down"}
                        />
                      </td>
                      <td className="px-5 py-3.5 text-gray-600 font-mono text-xs">
                        {ukSite.lastResponseTimeMs != null ? `${(ukSite.lastResponseTimeMs / 1000).toFixed(2)}s` : "—"}
                      </td>
                    </tr>
                  ) : report.sites.filter(s => s.url.includes(".co.uk")).map(site => (
                    <tr key={site.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3.5">
                        <a href={site.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                          {site.url.replace(/^https?:\/\//, "")}
                        </a>
                      </td>
                      <td className="px-5 py-3.5">
                        <StatusDot
                          ok={site.currentStatus === "up"}
                          text={site.currentStatus === "up" ? "Live" : site.currentStatus === "slow" ? "Slow" : "Down"}
                        />
                      </td>
                      <td className="px-5 py-3.5 text-gray-600 font-mono text-xs">
                        {site.lastResponseTimeMs != null ? `${(site.lastResponseTimeMs / 1000).toFixed(2)}s` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Payment Gateways — IE */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <CreditCard className="w-4 h-4 text-gray-400" />
              <h3 className="text-base font-semibold text-gray-900">Payment Gateways — Love Furniture IE</h3>
              <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium">EUR</span>
            </div>
            <GatewayTable gateways={report.iePaymentGateways} />
          </section>

          {/* Payment Gateways — UK */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <CreditCard className="w-4 h-4 text-gray-400" />
              <h3 className="text-base font-semibold text-gray-900">Payment Gateways — Love Furniture UK</h3>
              <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium">GBP</span>
            </div>
            <GatewayTable gateways={report.ukPaymentGateways} />
          </section>
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t bg-gray-50/50 rounded-b-2xl">
          <p className="text-xs text-gray-400">
            Generated by Site Sentinel · {format(new Date(report.generatedAt), "PPpp")}
          </p>
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #health-report-doc, #health-report-doc * { visibility: visible; }
          #health-report-doc { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
}
