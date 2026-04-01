import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  Users, UserPlus, Activity, TrendingUp, MousePointerClick, Eye, Clock, RefreshCw,
  BarChart2, Link2, Link2Off, AlertCircle, ChevronDown,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
  delay,
}: {
  icon: any;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay ?? 0 }}
    >
      <Card className="h-full hover:border-primary/20 transition-colors">
        <CardContent className="p-6">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">{label}</p>
              <h3 className="text-3xl font-bold font-display text-foreground">{value}</h3>
              {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
            </div>
            <div className={`p-3 rounded-xl ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function Analytics() {
  const [location] = useLocation();
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
          <h1 className="text-3xl font-display font-bold">Analytics</h1>
          <p className="text-muted-foreground mt-1">Google Analytics 4 — real-time & 30-day overview</p>
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
              {/* Property Picker */}
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
                variant="ghost"
                size="sm"
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
              <div className="grid grid-cols-1 gap-4">
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
              </div>

              {/* 30-day Metrics Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                <MetricCard
                  icon={Users}
                  label="Total Users"
                  value={gaData.totalUsers.toLocaleString()}
                  sub="Last 30 days"
                  color="bg-blue-100 text-blue-600"
                  delay={0.05}
                />
                <MetricCard
                  icon={UserPlus}
                  label="New Users"
                  value={gaData.newUsers.toLocaleString()}
                  sub={`${gaData.totalUsers > 0 ? Math.round((gaData.newUsers / gaData.totalUsers) * 100) : 0}% of total`}
                  color="bg-violet-100 text-violet-600"
                  delay={0.1}
                />
                <MetricCard
                  icon={MousePointerClick}
                  label="Sessions"
                  value={gaData.sessions.toLocaleString()}
                  sub="Last 30 days"
                  color="bg-orange-100 text-orange-600"
                  delay={0.15}
                />
                <MetricCard
                  icon={Eye}
                  label="Page Views"
                  value={gaData.pageViews.toLocaleString()}
                  sub={`${gaData.sessions > 0 ? (gaData.pageViews / gaData.sessions).toFixed(1) : 0} per session`}
                  color="bg-cyan-100 text-cyan-600"
                  delay={0.2}
                />
                <MetricCard
                  icon={TrendingUp}
                  label="Engagement Rate"
                  value={`${gaData.engagementRate}%`}
                  sub="% of engaged sessions"
                  color="bg-emerald-100 text-emerald-600"
                  delay={0.25}
                />
                <MetricCard
                  icon={Activity}
                  label="Bounce Rate"
                  value={`${gaData.bounceRate}%`}
                  sub="Single-page sessions"
                  color={gaData.bounceRate > 60 ? "bg-red-100 text-red-600" : "bg-yellow-100 text-yellow-600"}
                  delay={0.3}
                />
                <MetricCard
                  icon={Clock}
                  label="Avg Session Duration"
                  value={formatDuration(gaData.avgSessionDurationSec)}
                  sub="Time on site per session"
                  color="bg-pink-100 text-pink-600"
                  delay={0.35}
                />
              </div>

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
            The credentials are stored in the database — no environment variables required.
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
            Sign in with your Google account to pull live metrics from your GA4 properties — active users, sessions, engagement rate, and more.
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
