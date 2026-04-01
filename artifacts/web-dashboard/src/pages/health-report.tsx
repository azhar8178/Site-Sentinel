import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CheckCircle2, AlertTriangle, RefreshCw, Printer, Server, Globe, CreditCard, Edit2, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useState } from "react";

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
  const token = localStorage.getItem("sentinel_token");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${base}${url}`, { ...options, headers: { ...headers, ...(options?.headers ?? {}) } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

interface PaymentGateway {
  id: string;
  name: string;
  store: string;
  status: "active" | "inactive" | "maintenance";
  detail: string;
}

interface HealthReport {
  generatedAt: string;
  overallStatus: "operational" | "degraded" | "outage";
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
  paymentGateways: PaymentGateway[];
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

function GatewayStatus({ status }: { status: PaymentGateway["status"] }) {
  const map = {
    active: { label: "Active", ok: true },
    inactive: { label: "Inactive", ok: false },
    maintenance: { label: "Maintenance", ok: false },
  };
  const { label, ok } = map[status];
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

export default function HealthReport() {
  const queryClient = useQueryClient();
  const { data, isLoading, refetch, isFetching } = useQuery<HealthReport>({
    queryKey: ["/api/health-report"],
    queryFn: () => apiFetch<HealthReport>("/api/health-report"),
    refetchInterval: 60000,
  });

  const [editingGateways, setEditingGateways] = useState(false);
  const [gatewayDraft, setGatewayDraft] = useState<PaymentGateway[]>([]);

  const saveMutation = useMutation({
    mutationFn: (gateways: PaymentGateway[]) =>
      apiFetch("/api/health-report/payment-gateways", {
        method: "PUT",
        body: JSON.stringify({ paymentGateways: gateways }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/health-report"] });
      setEditingGateways(false);
    },
  });

  const startEditing = () => {
    setGatewayDraft(data?.paymentGateways ?? []);
    setEditingGateways(true);
  };

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Health Report</h1>
          <p className="text-muted-foreground mt-1">System-wide status summary</p>
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
          <h2 className="text-2xl font-display font-bold text-gray-900">Love Furniture — System Health Report</h2>
          <p className="text-gray-500 mt-1 text-sm">{generatedDate} — Post-Investigation Summary</p>
        </div>

        <div className="p-8 space-y-8">
          {/* Overall Status Banner */}
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${isOperational ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
            {isOperational
              ? <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              : <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />}
            <span className={`font-semibold text-sm ${isOperational ? "text-emerald-800" : "text-red-800"}`}>
              {isOperational ? "All Systems Operational" : `System Degraded — ${report.sites.filter(s => s.currentStatus !== "up").length} site(s) affected`}
            </span>
          </div>

          {/* Infrastructure (Servers) */}
          {report.servers.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Server className="w-4 h-4 text-gray-400" />
                <h3 className="text-base font-semibold text-gray-900">Infrastructure</h3>
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
                    {report.servers.map((server) => (
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
            </section>
          )}

          {/* Stores */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Globe className="w-4 h-4 text-gray-400" />
              <h3 className="text-base font-semibold text-gray-900">Stores</h3>
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
                  {report.sites.map((site) => (
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
                        {site.lastResponseTimeMs != null
                          ? `${(site.lastResponseTimeMs / 1000).toFixed(2)}s`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Payment Gateways */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-gray-400" />
                <h3 className="text-base font-semibold text-gray-900">Payment Gateways</h3>
              </div>
              {!editingGateways ? (
                <button
                  onClick={startEditing}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5" /> Edit
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => saveMutation.mutate(gatewayDraft)}
                    className="flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-800"
                  >
                    <Check className="w-3.5 h-3.5" /> Save
                  </button>
                  <button
                    onClick={() => setEditingGateways(false)}
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700"
                  >
                    <X className="w-3.5 h-3.5" /> Cancel
                  </button>
                </div>
              )}
            </div>
            <div className="border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-5 py-3 font-medium text-gray-500 w-1/4">Gateway</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-500 w-1/4">Store</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-500 w-1/4">Status</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-500">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(editingGateways ? gatewayDraft : report.paymentGateways).map((gw, idx) => (
                    <tr key={gw.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-gray-900">
                        {editingGateways ? (
                          <input
                            className="border rounded px-2 py-1 text-sm w-full"
                            value={gw.name}
                            onChange={(e) => {
                              const updated = [...gatewayDraft];
                              updated[idx] = { ...updated[idx], name: e.target.value };
                              setGatewayDraft(updated);
                            }}
                          />
                        ) : gw.name}
                      </td>
                      <td className="px-5 py-3.5 text-gray-600">
                        {editingGateways ? (
                          <input
                            className="border rounded px-2 py-1 text-sm w-full"
                            value={gw.store}
                            onChange={(e) => {
                              const updated = [...gatewayDraft];
                              updated[idx] = { ...updated[idx], store: e.target.value };
                              setGatewayDraft(updated);
                            }}
                          />
                        ) : gw.store}
                      </td>
                      <td className="px-5 py-3.5">
                        {editingGateways ? (
                          <select
                            className="border rounded px-2 py-1 text-sm w-full"
                            value={gw.status}
                            onChange={(e) => {
                              const updated = [...gatewayDraft];
                              updated[idx] = { ...updated[idx], status: e.target.value as PaymentGateway["status"] };
                              setGatewayDraft(updated);
                            }}
                          >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                            <option value="maintenance">Maintenance</option>
                          </select>
                        ) : (
                          <GatewayStatus status={gw.status} />
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-gray-500">
                        {editingGateways ? (
                          <input
                            className="border rounded px-2 py-1 text-sm w-full"
                            value={gw.detail}
                            onChange={(e) => {
                              const updated = [...gatewayDraft];
                              updated[idx] = { ...updated[idx], detail: e.target.value };
                              setGatewayDraft(updated);
                            }}
                          />
                        ) : gw.detail}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {editingGateways && (
              <button
                onClick={() => {
                  setGatewayDraft([...gatewayDraft, {
                    id: String(Date.now()),
                    name: "New Gateway",
                    store: "Both",
                    status: "active",
                    detail: "Active",
                  }]);
                }}
                className="mt-2 text-xs text-primary hover:underline"
              >
                + Add gateway
              </button>
            )}
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
