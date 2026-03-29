import { useListServers, useDeleteServer } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Server as ServerIcon, Cpu, HardDrive, MemoryStick, Trash2, Activity } from "lucide-react";
import { formatBytes } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

export default function Servers() {
  const { data: servers, refetch } = useListServers();
  const deleteMutation = useDeleteServer();

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this server?")) {
      deleteMutation.mutate({ serverId: id }, { onSuccess: () => refetch() });
    }
  };

  const getStatusColor = (percent: number) => {
    if (percent > 90) return 'bg-destructive';
    if (percent > 75) return 'bg-warning';
    return 'bg-success';
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-display font-bold">Infrastructure</h1>
          <p className="text-muted-foreground mt-1">Server health and vitals</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {servers?.map(server => {
          const m = server.latestMetrics;
          const memPercent = m ? (m.memUsedBytes / m.memTotalBytes) * 100 : 0;
          const diskPercent = m ? (m.diskUsedBytes / m.diskTotalBytes) * 100 : 0;
          const isOnline = server.isActive;

          return (
            <Card key={server.id} className="overflow-hidden hover:shadow-lg transition-all duration-300 border-border/50 group relative">
              <button 
                onClick={() => handleDelete(server.id)}
                className="absolute top-4 right-4 p-2 text-muted-foreground hover:bg-destructive hover:text-white rounded-full transition-colors opacity-0 group-hover:opacity-100"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              
              <div className={`h-2 w-full ${isOnline ? 'bg-success' : 'bg-destructive'}`} />
              
              <CardContent className="p-6">
                <div className="flex items-start gap-4 mb-6">
                  <div className="bg-secondary p-3 rounded-xl">
                    <ServerIcon className="w-8 h-8 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold font-display">{server.name}</h3>
                    <p className="text-sm text-muted-foreground font-mono mt-0.5">{server.hostname}</p>
                  </div>
                  <div className="ml-auto mt-1">
                    <Badge variant={isOnline ? 'success' : 'destructive'}>
                      {isOnline ? 'Online' : 'Offline'}
                    </Badge>
                  </div>
                </div>

                {m ? (
                  <div className="space-y-5">
                    <div>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="flex items-center gap-1.5 font-medium"><Cpu className="w-4 h-4 text-muted-foreground"/> CPU Usage</span>
                        <span className="font-mono">{m.cpuPercent.toFixed(1)}%</span>
                      </div>
                      <Progress value={m.cpuPercent} indicatorColor={getStatusColor(m.cpuPercent)} className="h-2.5 bg-secondary" />
                    </div>

                    <div>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="flex items-center gap-1.5 font-medium"><MemoryStick className="w-4 h-4 text-muted-foreground"/> Memory</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {formatBytes(m.memUsedBytes)} / {formatBytes(m.memTotalBytes)}
                        </span>
                      </div>
                      <Progress value={memPercent} indicatorColor={getStatusColor(memPercent)} className="h-2.5 bg-secondary" />
                    </div>

                    <div>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="flex items-center gap-1.5 font-medium"><HardDrive className="w-4 h-4 text-muted-foreground"/> Disk Space</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {formatBytes(m.diskUsedBytes)} / {formatBytes(m.diskTotalBytes)}
                        </span>
                      </div>
                      <Progress value={diskPercent} indicatorColor={getStatusColor(diskPercent)} className="h-2.5 bg-secondary" />
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-4 border-t mt-4">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Load Average</p>
                        <p className="font-mono text-sm">{m.loadAvg1m.toFixed(2)} • {m.loadAvg5m.toFixed(2)} • {m.loadAvg15m.toFixed(2)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground mb-1">Last Updated</p>
                        <p className="text-sm">{formatDistanceToNow(new Date(m.recordedAt), { addSuffix: true })}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-8 text-center bg-slate-50 rounded-xl border border-dashed">
                    <Activity className="w-8 h-8 mx-auto text-muted-foreground mb-2 opacity-50" />
                    <p className="text-sm text-muted-foreground">Waiting for initial telemetry...</p>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
