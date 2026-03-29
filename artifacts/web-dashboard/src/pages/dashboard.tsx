import { useListSites, useTriggerCheck } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, Clock, Globe, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatMs } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { motion } from "framer-motion";

export default function Dashboard() {
  const { data: sites, isLoading, refetch } = useListSites();
  const triggerCheck = useTriggerCheck();

  const handleCheck = (siteId: number) => {
    triggerCheck.mutate({ siteId }, {
      onSuccess: () => refetch()
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  const downSites = sites?.filter(s => s.currentStatus === 'down') || [];
  const hasIssues = downSites.length > 0;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Real-time system status overview</p>
        </div>
        <Button onClick={() => refetch()} variant="outline" className="gap-2 bg-white">
          <RefreshCw className="w-4 h-4" /> Refresh
        </Button>
      </div>

      {/* Global Status Banner */}
      <Card className={`border-l-4 shadow-sm overflow-hidden ${hasIssues ? 'border-l-destructive bg-destructive/5' : 'border-l-success bg-success/5'}`}>
        <CardContent className="p-6 flex items-center gap-4">
          <div className={`p-3 rounded-full ${hasIssues ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'}`}>
            {hasIssues ? <AlertTriangle className="w-8 h-8" /> : <CheckCircle2 className="w-8 h-8" />}
          </div>
          <div>
            <h2 className="text-xl font-bold font-display">
              {hasIssues ? `${downSites.length} Systems Down` : "All Systems Operational"}
            </h2>
            <p className="text-muted-foreground">
              {hasIssues 
                ? "Immediate attention required on critical infrastructure." 
                : "Monitoring is active and all services are responding normally."}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {sites?.map((site, index) => (
          <motion.div 
            key={site.id} 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ delay: index * 0.1 }}
          >
            <Card className="h-full flex flex-col hover:border-primary/30 transition-colors">
              <CardContent className="p-6 flex-1 flex flex-col">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-2">
                    <Globe className="w-5 h-5 text-muted-foreground" />
                    <h3 className="font-bold text-lg font-display line-clamp-1" title={site.name}>{site.name}</h3>
                  </div>
                  <Badge variant={site.currentStatus === 'up' ? 'success' : site.currentStatus === 'down' ? 'destructive' : 'warning'}>
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${site.currentStatus === 'up' ? 'bg-success status-dot-up' : site.currentStatus === 'down' ? 'bg-destructive status-dot-down' : 'bg-warning'}`} />
                      {site.currentStatus.toUpperCase()}
                    </div>
                  </Badge>
                </div>
                
                <a href={site.url} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline block mb-6 truncate">
                  {site.url}
                </a>

                <div className="grid grid-cols-2 gap-4 mt-auto mb-6 bg-secondary/50 p-4 rounded-xl">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                      <Activity className="w-3 h-3" /> Response
                    </p>
                    <p className="font-semibold text-foreground">
                      {formatMs(site.lastResponseTimeMs)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Last Checked
                    </p>
                    <p className="font-semibold text-foreground text-sm">
                      {site.lastCheckedAt ? formatDistanceToNow(new Date(site.lastCheckedAt), { addSuffix: true }) : 'Never'}
                    </p>
                  </div>
                </div>

                <Button 
                  variant="outline" 
                  className="w-full bg-white"
                  onClick={() => handleCheck(site.id)}
                  disabled={triggerCheck.isPending}
                >
                  {triggerCheck.isPending ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
                  Check Now
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
