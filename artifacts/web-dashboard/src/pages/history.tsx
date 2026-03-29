import { useState } from "react";
import { useListSites, useGetCheckHistory } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { format } from "date-fns";
import { Activity, Clock, ShieldAlert } from "lucide-react";

export default function History() {
  const { data: sites } = useListSites();
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);
  const [hours, setHours] = useState<number>(24);

  // Auto-select first site when loaded
  if (sites && sites.length > 0 && selectedSiteId === null) {
    setSelectedSiteId(sites[0].id);
  }

  const { data: history, isLoading } = useGetCheckHistory(
    selectedSiteId ?? 0, 
    { hours, limit: 100 }, 
    { query: { enabled: !!selectedSiteId } }
  );

  const chartData = history?.checks.map(c => ({
    time: format(new Date(c.checkedAt), "HH:mm"),
    fullTime: new Date(c.checkedAt).toLocaleString(),
    responseTime: c.responseTimeMs || 0,
    isUp: c.isUp,
    status: c.statusCode
  })).reverse() || [];

  const avgResponse = chartData.length > 0 
    ? Math.round(chartData.reduce((acc, curr) => acc + curr.responseTime, 0) / chartData.length) 
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold">Uptime History</h1>
        <p className="text-muted-foreground mt-1">Detailed response time and availability metrics</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white p-4 rounded-2xl shadow-sm border">
        <div className="flex gap-2 overflow-x-auto w-full pb-2 sm:pb-0 sm:w-auto">
          {sites?.map(site => (
            <button
              key={site.id}
              onClick={() => setSelectedSiteId(site.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                selectedSiteId === site.id 
                ? 'bg-primary text-primary-foreground shadow-md' 
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
            >
              {site.name}
            </button>
          ))}
        </div>
        
        <div className="flex bg-secondary p-1 rounded-lg">
          {[1, 6, 24].map(h => (
            <button
              key={h}
              onClick={() => setHours(h)}
              className={`px-3 py-1.5 text-sm rounded-md font-medium transition-all ${
                hours === h ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {h}h
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="h-64 flex items-center justify-center"><Activity className="w-8 h-8 animate-pulse text-muted-foreground" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardContent className="p-6 flex items-center gap-4">
                <div className="bg-primary/10 p-4 rounded-xl text-primary"><Activity className="w-6 h-6" /></div>
                <div>
                  <p className="text-sm text-muted-foreground">Average Response</p>
                  <p className="text-2xl font-bold font-display">{avgResponse}ms</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 flex items-center gap-4">
                <div className="bg-success/10 p-4 rounded-xl text-success"><ShieldAlert className="w-6 h-6" /></div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Checks (Period)</p>
                  <p className="text-2xl font-bold font-display">{history?.total || 0}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 flex items-center gap-4">
                <div className="bg-warning/10 p-4 rounded-xl text-warning"><Clock className="w-6 h-6" /></div>
                <div>
                  <p className="text-sm text-muted-foreground">Peak Response</p>
                  <p className="text-2xl font-bold font-display">
                    {Math.max(0, ...chartData.map(d => d.responseTime))}ms
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <CardHeader className="border-b bg-slate-50/50">
              <CardTitle>Response Time Chart</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}
                      labelStyle={{ fontWeight: 'bold', color: '#0f172a', marginBottom: '4px' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="responseTime" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={3}
                      dot={false}
                      activeDot={{ r: 6, strokeWidth: 0, fill: 'hsl(var(--primary))' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Checks</CardTitle>
            </CardHeader>
            <div className="divide-y border-t">
              {history?.checks.slice(0, 10).map(check => (
                <div key={check.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`w-3 h-3 rounded-full ${check.isUp ? 'bg-success' : 'bg-destructive'}`} />
                    <div>
                      <p className="font-medium text-sm">{format(new Date(check.checkedAt), "MMM d, yyyy HH:mm:ss")}</p>
                      {check.errorMessage && <p className="text-xs text-destructive mt-0.5">{check.errorMessage}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {check.statusCode && <Badge variant="outline">HTTP {check.statusCode}</Badge>}
                    <span className="text-sm font-medium w-16 text-right">{check.responseTimeMs}ms</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
