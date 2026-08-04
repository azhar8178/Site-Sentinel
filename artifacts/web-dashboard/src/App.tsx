import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { setBaseUrl } from "@workspace/api-client-react";

import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { Layout } from "@/components/layout";

import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import History from "@/pages/history";
import Store from "@/pages/store";
import Servers from "@/pages/servers";
import Alerts from "@/pages/alerts";
import Settings from "@/pages/settings";
import HealthReport from "@/pages/health-report";
import Analytics from "@/pages/analytics";
import IncidentAnalysis from "@/pages/incident-analysis";
import NotFound from "@/pages/not-found";

const base = import.meta.env.BASE_URL.replace(/\/$/, "");
setBaseUrl(`${window.location.origin}${base}`);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 15000,
      refetchInterval: 30000,
    }
  }
});

function AppRoutes() {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user && location !== "/login") {
    return <Redirect to="/login" />;
  }

  if (user && location === "/login") {
    return <Redirect to="/" />;
  }

  if (!user) {
    return <Login />;
  }

  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/history" component={History} />
        <Route path="/store" component={Store} />
        <Route path="/servers" component={Servers} />
        <Route path="/alerts" component={Alerts} />
        <Route path="/health-report" component={HealthReport} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/incident-analysis" component={IncidentAnalysis} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={base}>
            <AuthProvider>
              <AppRoutes />
            </AuthProvider>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
