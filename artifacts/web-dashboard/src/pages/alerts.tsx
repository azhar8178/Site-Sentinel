import { useListAlerts } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, ServerCrash, CheckCircle, Clock, Zap, Database, Activity } from "lucide-react";
import { format } from "date-fns";

export default function Alerts() {
  const { data } = useListAlerts({ limit: 50 });

  const getAlertConfig = (type: string) => {
    switch (type) {
      case 'downtime': return { icon: ServerCrash, color: 'text-destructive', bg: 'bg-destructive/10' };
      case 'recovery': return { icon: CheckCircle, color: 'text-success', bg: 'bg-success/10' };
      case 'slow_response': return { icon: Clock, color: 'text-warning', bg: 'bg-warning/10' };
      case 'cpu_high': return { icon: Zap, color: 'text-destructive', bg: 'bg-destructive/10' };
      case 'ram_high': return { icon: Activity, color: 'text-warning', bg: 'bg-warning/10' };
      case 'disk_high': return { icon: Database, color: 'text-destructive', bg: 'bg-destructive/10' };
      default: return { icon: AlertCircle, color: 'text-primary', bg: 'bg-primary/10' };
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-display font-bold">Alert Feed</h1>
        <p className="text-muted-foreground mt-1">Chronological history of system events</p>
      </div>

      <div className="relative space-y-4 before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
        {data?.alerts.map(alert => {
          const config = getAlertConfig(alert.alertType);
          const Icon = config.icon;
          
          return (
            <div key={alert.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
              <div className={`flex items-center justify-center w-10 h-10 rounded-full border-4 border-white shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm ${config.bg} ${config.color} z-10`}>
                <Icon className="w-4 h-4" />
              </div>
              
              <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-2xl border bg-white shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-sm text-primary uppercase tracking-wider font-display">
                    {alert.alertType.replace('_', ' ')}
                  </span>
                  <time className="text-xs text-muted-foreground font-medium bg-slate-50 px-2 py-1 rounded-md">
                    {format(new Date(alert.createdAt), "MMM d, HH:mm:ss")}
                  </time>
                </div>
                
                <p className="text-foreground text-sm mb-3">
                  {alert.message}
                </p>
                
                <div className="flex gap-2 flex-wrap">
                  {alert.siteName && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                      Site: {alert.siteName}
                    </span>
                  )}
                  {alert.serverName && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                      Server: {alert.serverName}
                    </span>
                  )}
                  {alert.statusCode && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono bg-slate-100 text-slate-600">
                      HTTP {alert.statusCode}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
