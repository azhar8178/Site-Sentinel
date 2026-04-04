import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  Users, UserPlus, Activity, TrendingUp, MousePointerClick, Eye, Clock, RefreshCw,
  BarChart2, Link2, Link2Off, AlertCircle, ChevronDown, Globe, Smartphone, Monitor, Tablet,
  ShoppingBag, Package, DollarSign, ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
  const token = localStorage.getItem("sentinel_token");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${base}${url}`, { ...options, headers: { ...headers, ...(options?.headers ?? {}) } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

interface GAStatus {
  connected: boolean;
  email?: string;
  selectedPropertyId?: string;
  expiresAt?: string;
  configured: boolean;
}

interface GAProperty {
  id: string;
  name: string;
  displayName: string;
}

interface GAEcommerce {
  revenue: number;
  transactions: number;
  avgOrderValue: number;
  conversionRate: number;
  addToCarts: number;
  checkouts: number;
  cartToViewRate: number;
  buyToDetailRate: number;
  hasData: boolean;
}

interface GAData {
  propertyId: string;
  activeUsers: number;
  sessions: number;
  newUsers: number;
  totalUsers: number;
  engagementRate: number;
  bounceRate: number;
  pageViews: number;
  avgSessionDurationSec: number;
  channels: { name: string; sessions: number; users: number }[];
  topPages: { path: string; title: string; views: number; avgDurationSec: number }[];
  devices: { category: string; sessions: number; users: number }[];
  countries: { country: string; sessions: number; users: number }[];
  ecommerce: GAEcommerce;
  topProducts: { name: string; revenue: number; units: number; views: number }[];
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatRevenue(value: number): string {
  const [int, dec] = value.toFixed(2).split(".");
  const intFormatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `€${intFormatted}.${dec}`;
}

function dropOff(from: number, to: number): string {
  if (from === 0) return "—";
  const pct = Math.round((1 - to / from) * 100);
  return `${pct}% drop-off`;
}

function MetricCard({
  icon: Icon, label, value, sub, color, delay,
}: {
  icon: any; label: string; value: string | number; sub?: string; color: string; delay?: number;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: delay ?? 0 }}>
      <Card className="h-full hover:border-primary/20 transition-colors">
        <CardContent className="p-5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">{label}</p>
              <h3 className="text-3xl font-bold font-display text-foreground">{value}</h3>
              {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
            </div>
            <div className={`p-2.5 rounded-xl ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function HorizBar({ value, max, color = "bg-primary" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

const DEVICE_ICONS: Record<string, any> = {
  mobile: Smartphone,
  desktop: Monitor,
  tablet: Tablet,
};

const CHANNEL_COLORS: Record<string, string> = {
  "Organic Search": "bg-emerald-500",
  "Direct": "bg-blue-500",
  "Referral": "bg-violet-500",
  "Organic Social": "bg-pink-500",
  "Paid Search": "bg-orange-500",
  "Email": "bg-cyan-500",
  "Organic Video": "bg-red-500",
  "Unassigned": "bg-gray-400",
};

function channelColor(name: string) {
  return CHANNEL_COLORS[name] ?? "bg-gray-400";
}

export default function Analytics() {
  const [_location] = useLocation();
  const queryClient = useQueryClient();
  const [propertyPickerOpen, setPropertyPickerOpen] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("ga_error");
    const connected = params.get("ga_connected");
    if (err) {
      setUrlError(decodeURIComponent(err));
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (connected) {
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/google/status"] });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const { data: status, isLoading: statusLoading } = useQuery<GAStatus>({
    queryKey: ["/api/analytics/google/status"],
    queryFn: () => apiFetch<GAStatus>("/api/analytics/google/status"),
  });

  const { data: properties, isLoading: propsLoading } = useQuery<{ properties: GAProperty[] }>({
    queryKey: ["/api/analytics/google/properties"],
    queryFn: () => apiFetch("/api/analytics/google/properties"),
    enabled: status?.connected === true,
  });

  const { data: gaData, isLoading: dataLoading, refetch: refetchData, error: dataError } = useQuery<GAData>({
    queryKey: ["/api/analytics/google/data", status?.selectedPropertyId],
    queryFn: () =>
      apiFetch<GAData>("/api/analytics/google/data", {
        method: "POST",
        body: JSON.stringify({ propertyId: status?.selectedPropertyId }),
      }),
    enabled: status?.connected === true && !!status?.selectedPropertyId,
    refetchInterval: 30000,
  });

  const connectMutation = useMutation({
    mutationFn: () => apiFetch<{ url: string }>("/api/analytics/google/auth-url"),
    onSuccess: ({ url }) => { window.location.href = url; },
    onError: (err: Error) => { setUrlError(err.message); },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => apiFetch("/api/analytics/google/disconnect", { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/analytics/google/status"] }),
  });

  const selectPropertyMutation = useMutation({
    mutationFn: ({ propertyId, email }: { propertyId: string; email: string }) =>
      apiFetch("/api/analytics/google/select-property", {
        method: "POST",
        body: JSON.stringify({ propertyId, email }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/google/status"] });
      setPropertyPickerOpen(false);
    },
  });

  const selectedProp = properties?.properties.find((p) => p.id === status?.selectedPropertyId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Analytics</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Google Analytics 4 — real-time &amp; 30-day overview</p>
        </div>
        {status?.connected && gaData && (
          <Button variant="outline" onClick={() => refetchData()} disabled={dataLoading} className="gap-2 bg-white">
            <RefreshCw className={`w-4 h-4 ${dataLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        )}
      </div>

      {urlError && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <div>
            <p className="font-medium">Google connection error</p>
            <p className="text-red-600 mt-0.5">{urlError}</p>
          </div>
          <button onClick={() => setUrlError(null)} className="ml-auto text-red-400 hover:text-red-700">✕</button>
        </div>
      )}

      {statusLoading ? (
        <div className="flex items-center justify-center h-48">
          <RefreshCw className="w-7 h-7 animate-spin text-primary" />
        </div>
      ) : !status?.configured ? (
        <NotConfiguredCard />
      ) : !status?.connected ? (
        <ConnectCard onConnect={() => connectMutation.mutate()} isPending={connectMutation.isPending} />
      ) : (
        <>
          {/* Connection Bar */}
          <div className="flex items-center justify-between p-4 bg-white border rounded-xl shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                <Link2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Connected to Google Analytics</p>
                {status.email && <p className="text-xs text-muted-foreground">{status.email}</p>}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <button
                  onClick={() => setPropertyPickerOpen(!propertyPickerOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 border rounded-lg text-sm bg-white hover:bg-gray-50 transition-colors"
                >
                  <BarChart2 className="w-4 h-4 text-muted-foreground" />
                  <span className="text-gray-700 max-w-[200px] truncate">
                    {selectedProp?.displayName ?? (status.selectedPropertyId ? "Loading..." : "Select property")}
                  </span>
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                </button>
                {propertyPickerOpen && (
                  <div className="absolute right-0 top-full mt-1 w-72 bg-white border rounded-xl shadow-lg z-20 py-1 max-h-64 overflow-y-auto">
                    {propsLoading ? (
                      <div className="px-4 py-3 text-sm text-muted-foreground text-center">Loading properties...</div>
                    ) : (properties?.properties ?? []).length === 0 ? (
                      <div className="px-4 py-3 text-sm text-muted-foreground text-center">No GA4 properties found</div>
                    ) : (
                      properties!.properties.map((prop) => (
                        <button
                          key={prop.id}
                          onClick={() => selectPropertyMutation.mutate({ propertyId: prop.id, email: status.email ?? "" })}
                          className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${prop.id === status.selectedPropertyId ? "text-primary font-semibold" : "text-gray-700"}`}
                        >
                          {prop.displayName}
                          <span className="block text-xs text-muted-foreground">{prop.id}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <Button
                variant="ghost" size="sm"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
                className="text-muted-foreground hover:text-destructive gap-2"
              >
                <Link2Off className="w-4 h-4" />
                Disconnect
              </Button>
            </div>
          </div>

          {!status.selectedPropertyId ? (
            <div className="flex flex-col items-center justify-center h-48 text-center text-muted-foreground">
              <BarChart2 className="w-10 h-10 mb-3 opacity-30" />
              <p className="font-medium">Select a GA4 property above to see data</p>
            </div>
          ) : dataLoading ? (
            <div className="flex items-center justify-center h-48">
              <RefreshCw className="w-7 h-7 animate-spin text-primary" />
            </div>
          ) : dataError ? (
            <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <div>
                <p className="font-medium">Failed to load analytics data</p>
                <p className="text-red-600 mt-0.5">{(dataError as Error).message}</p>
              </div>
            </div>
          ) : gaData ? (
            <>
              {/* Active Users — Realtime */}
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="p-6 flex items-center gap-6">
                    <div className="p-4 bg-primary/10 rounded-xl text-primary">
                      <Activity className="w-8 h-8" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Active Users Right Now</p>
                      <h2 className="text-5xl font-bold font-display text-primary mt-1">{gaData.activeUsers.toLocaleString()}</h2>
                      <p className="text-xs text-muted-foreground mt-1">Real-time — updates every 30s</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* 30-day Metrics Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <MetricCard icon={Users} label="Total Users" value={gaData.totalUsers.toLocaleString()} sub="Last 30 days" color="bg-blue-100 text-blue-600" delay={0.05} />
                <MetricCard icon={UserPlus} label="New Users" value={gaData.newUsers.toLocaleString()} sub={`${gaData.totalUsers > 0 ? Math.round((gaData.newUsers / gaData.totalUsers) * 100) : 0}% of total`} color="bg-violet-100 text-violet-600" delay={0.1} />
                <MetricCard icon={MousePointerClick} label="Sessions" value={gaData.sessions.toLocaleString()} sub="Last 30 days" color="bg-orange-100 text-orange-600" delay={0.15} />
                <MetricCard icon={Eye} label="Page Views" value={gaData.pageViews.toLocaleString()} sub={`${gaData.sessions > 0 ? (gaData.pageViews / gaData.sessions).toFixed(1) : 0} per session`} color="bg-cyan-100 text-cyan-600" delay={0.2} />
                <MetricCard icon={TrendingUp} label="Engagement Rate" value={`${gaData.engagementRate}%`} sub="% of engaged sessions" color="bg-emerald-100 text-emerald-600" delay={0.25} />
                <MetricCard icon={Activity} label="Bounce Rate" value={`${gaData.bounceRate}%`} sub="Single-page sessions" color={gaData.bounceRate > 60 ? "bg-red-100 text-red-600" : "bg-yellow-100 text-yellow-600"} delay={0.3} />
                <MetricCard icon={Clock} label="Avg Session Duration" value={formatDuration(gaData.avgSessionDurationSec)} sub="Time on site per session" color="bg-pink-100 text-pink-600" delay={0.35} />
              </div>

              {/* ── Monetization ── */}
              {gaData.ecommerce?.hasData ? (
                <>
                  {/* Revenue & Conversion strip */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Ecommerce · Last 30 Days</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <MetricCard icon={DollarSign} label="Revenue" value={formatRevenue(gaData.ecommerce.revenue)} sub="GA4 reporting currency" color="bg-emerald-100 text-emerald-700" delay={0.05} />
                      <MetricCard icon={ShoppingBag} label="Orders" value={gaData.ecommerce.transactions.toLocaleString()} sub="Completed purchases" color="bg-blue-100 text-blue-700" delay={0.1} />
                      <MetricCard icon={DollarSign} label="Avg Order Value" value={formatRevenue(gaData.ecommerce.avgOrderValue)} sub="Per transaction" color="bg-violet-100 text-violet-700" delay={0.15} />
                      <MetricCard icon={TrendingUp} label="Conversion Rate" value={`${gaData.ecommerce.conversionRate}%`} sub="Sessions that purchased" color="bg-orange-100 text-orange-700" delay={0.2} />
                    </div>
                  </div>

                  {/* Conversion Funnel */}
                  <Card className="shadow-none border">
                    <CardHeader className="pb-2 pt-5 px-5">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-muted-foreground" /> Conversion Funnel
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-5 pb-5">
                      <div className="flex items-stretch gap-1">
                        {[
                          { label: "Sessions", value: gaData.sessions, color: "bg-blue-500" },
                          { label: "Add to Cart", value: gaData.ecommerce.addToCarts, color: "bg-orange-500" },
                          { label: "Checkout", value: gaData.ecommerce.checkouts, color: "bg-violet-500" },
                          { label: "Purchase", value: gaData.ecommerce.transactions, color: "bg-emerald-500" },
                        ].map((step, idx, arr) => {
                          const prev = arr[idx - 1];
                          const rate = prev ? dropOff(prev.value, step.value) : null;
                          return (
                            <div key={step.label} className="flex items-center gap-1 flex-1">
                              {idx > 0 && (
                                <div className="flex flex-col items-center shrink-0 px-1">
                                  <ArrowRight className="w-4 h-4 text-muted-foreground/40" />
                                  {rate && <span className="text-[10px] text-muted-foreground mt-0.5">{rate}</span>}
                                </div>
                              )}
                              <div className="flex-1 bg-muted/30 rounded-xl p-3 text-center border">
                                <div className={`w-2 h-2 rounded-full ${step.color} mx-auto mb-2`} />
                                <p className="text-xs text-muted-foreground font-medium">{step.label}</p>
                                <p className="text-lg font-bold font-display text-foreground mt-0.5">{step.value.toLocaleString()}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Top Products */}
                  {(gaData.topProducts?.length ?? 0) > 0 && (
                    <Card className="shadow-none border">
                      <CardHeader className="pb-2 pt-5 px-5">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          <Package className="w-4 h-4 text-muted-foreground" /> Top Products
                        </CardTitle>
                      </CardHeader>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="border-t border-b bg-muted/30">
                            <tr>
                              <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground">Product</th>
                              <th className="text-right px-5 py-2.5 text-xs font-medium text-muted-foreground">Revenue</th>
                              <th className="text-right px-5 py-2.5 text-xs font-medium text-muted-foreground">Units</th>
                              <th className="text-right px-5 py-2.5 text-xs font-medium text-muted-foreground">Views</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {gaData.topProducts.map((p) => (
                              <tr key={p.name} className="hover:bg-muted/20 transition-colors">
                                <td className="px-5 py-3 max-w-xs">
                                  <p className="font-medium text-xs truncate">{p.name}</p>
                                </td>
                                <td className="px-5 py-3 text-right text-xs font-mono font-semibold text-emerald-700">{formatRevenue(p.revenue)}</td>
                                <td className="px-5 py-3 text-right text-xs font-mono">{p.units.toLocaleString()}</td>
                                <td className="px-5 py-3 text-right text-xs text-muted-foreground font-mono">{p.views.toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-3 px-5 py-4 bg-muted/30 border rounded-xl text-sm text-muted-foreground">
                  <ShoppingBag className="w-5 h-5 shrink-0 opacity-50" />
                  <span>Ecommerce tracking not detected on this property — revenue, orders, and product data will appear here once GA4 Enhanced Ecommerce is enabled on your Magento store.</span>
                </div>
              )}

              {/* Second row: Channels + Devices + Countries */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

                {/* Traffic Channels */}
                {(gaData.channels?.length ?? 0) > 0 && (
                  <Card className="shadow-none border">
                    <CardHeader className="pb-2 pt-5 px-5">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-muted-foreground" /> Traffic Channels
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-5 pb-5 space-y-3">
                      {gaData.channels.map((ch) => {
                        const pct = gaData.sessions > 0 ? Math.round((ch.sessions / gaData.sessions) * 100) : 0;
                        return (
                          <div key={ch.name} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="flex items-center gap-1.5 font-medium text-foreground">
                                <span className={`w-2 h-2 rounded-full shrink-0 ${channelColor(ch.name)}`} />
                                {ch.name}
                              </span>
                              <span className="text-muted-foreground font-mono">{ch.sessions.toLocaleString()} <span className="text-muted-foreground/60">({pct}%)</span></span>
                            </div>
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${channelColor(ch.name)}`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                )}

                {/* Device Breakdown */}
                {(gaData.devices?.length ?? 0) > 0 && (
                  <Card className="shadow-none border">
                    <CardHeader className="pb-2 pt-5 px-5">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-muted-foreground" /> Devices
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-5 pb-5 space-y-3">
                      {gaData.devices.map((d) => {
                        const pct = gaData.sessions > 0 ? Math.round((d.sessions / gaData.sessions) * 100) : 0;
                        const DevIcon = DEVICE_ICONS[d.category.toLowerCase()] ?? Monitor;
                        return (
                          <div key={d.category} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="flex items-center gap-1.5 font-medium text-foreground capitalize">
                                <DevIcon className="w-3.5 h-3.5 text-muted-foreground" />
                                {d.category}
                              </span>
                              <span className="text-muted-foreground font-mono">{d.sessions.toLocaleString()} <span className="text-muted-foreground/60">({pct}%)</span></span>
                            </div>
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                )}

                {/* Top Countries */}
                {(gaData.countries?.length ?? 0) > 0 && (
                  <Card className="shadow-none border">
                    <CardHeader className="pb-2 pt-5 px-5">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Globe className="w-4 h-4 text-muted-foreground" /> Top Countries
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-5 pb-5 space-y-3">
                      {gaData.countries.slice(0, 8).map((c) => {
                        const pct = gaData.sessions > 0 ? Math.round((c.sessions / gaData.sessions) * 100) : 0;
                        return (
                          <div key={c.country} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-medium text-foreground">{c.country}</span>
                              <span className="text-muted-foreground font-mono">{c.sessions.toLocaleString()} <span className="text-muted-foreground/60">({pct}%)</span></span>
                            </div>
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-emerald-500/70" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Top Pages */}
              {(gaData.topPages?.length ?? 0) > 0 && (
                <Card className="shadow-none border">
                  <CardHeader className="pb-2 pt-5 px-5">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Eye className="w-4 h-4 text-muted-foreground" /> Top Pages
                    </CardTitle>
                  </CardHeader>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-t border-b bg-muted/30">
                        <tr>
                          <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground">Page</th>
                          <th className="text-right px-5 py-2.5 text-xs font-medium text-muted-foreground">Views</th>
                          <th className="text-right px-5 py-2.5 text-xs font-medium text-muted-foreground">Avg Time</th>
                          <th className="text-right px-5 py-2.5 text-xs font-medium text-muted-foreground w-32">Share</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {gaData.topPages.map((p) => {
                          const maxViews = gaData.topPages[0]?.views ?? 1;
                          return (
                            <tr key={p.path} className="hover:bg-muted/20 transition-colors">
                              <td className="px-5 py-3 max-w-xs">
                                <p className="font-medium text-xs truncate">{p.title || p.path}</p>
                                <p className="text-xs text-muted-foreground font-mono truncate">{p.path}</p>
                              </td>
                              <td className="px-5 py-3 text-right text-xs font-mono font-semibold">{p.views.toLocaleString()}</td>
                              <td className="px-5 py-3 text-right text-xs text-muted-foreground">{formatDuration(p.avgDurationSec)}</td>
                              <td className="px-5 py-3">
                                <HorizBar value={p.views} max={maxViews} color="bg-primary/60" />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              <p className="text-xs text-muted-foreground text-right">
                Data from Google Analytics 4 · Property: {gaData.propertyId}
              </p>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

function NotConfiguredCard() {
  return (
    <Card>
      <CardContent className="p-10 text-center space-y-4">
        <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto">
          <AlertCircle className="w-7 h-7 text-amber-600" />
        </div>
        <div>
          <h3 className="text-lg font-semibold font-display">Google OAuth not configured</h3>
          <p className="text-muted-foreground text-sm mt-2 max-w-md mx-auto">
            Add your Google OAuth credentials in <strong>Settings → Google Analytics</strong> to enable this integration.
          </p>
        </div>
        <div className="bg-gray-50 border rounded-xl p-5 text-left text-sm max-w-lg mx-auto space-y-2">
          <p className="font-semibold text-gray-800">Quick setup:</p>
          <ol className="list-decimal list-inside space-y-1.5 text-gray-600">
            <li>Go to <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Google Cloud Console</a> → enable <strong>Google Analytics Data API</strong> &amp; <strong>Admin API</strong></li>
            <li>Credentials → Create OAuth 2.0 Client ID (Web application type)</li>
            <li>Copy the Redirect URI from Settings → Google Analytics and add it as an Authorized Redirect URI</li>
            <li>Paste the Client ID and Client Secret into <strong>Settings → Google Analytics</strong> and save</li>
            <li>Return here and click "Sign in with Google"</li>
          </ol>
        </div>
        <a href="/settings" className="inline-block mt-2 px-5 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors">
          Go to Settings
        </a>
      </CardContent>
    </Card>
  );
}

function ConnectCard({ onConnect, isPending }: { onConnect: () => void; isPending: boolean }) {
  return (
    <Card>
      <CardContent className="p-10 text-center space-y-5">
        <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto">
          <BarChart2 className="w-8 h-8 text-blue-600" />
        </div>
        <div>
          <h3 className="text-xl font-semibold font-display">Connect Google Analytics</h3>
          <p className="text-muted-foreground text-sm mt-2 max-w-sm mx-auto">
            Sign in with your Google account to pull live metrics from your GA4 properties.
          </p>
        </div>
        <Button onClick={onConnect} disabled={isPending} className="gap-2 px-8">
          {isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
          )}
          Sign in with Google
        </Button>
      </CardContent>
    </Card>
  );
}
