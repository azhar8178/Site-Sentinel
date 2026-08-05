import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { 
  LayoutDashboard, 
  Activity, 
  ShoppingCart, 
  Server, 
  ShieldCheck,
  Rocket,
  Bell, 
  Settings,
  LogOut,
  Menu,
  X,
  ClipboardList,
  BarChart2,
  Sparkles,
  Sun,
  Moon,
} from "lucide-react";
import { useState } from "react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/history", label: "History", icon: Activity },
  { href: "/store", label: "Store", icon: ShoppingCart },
  { href: "/servers", label: "Servers", icon: Server },
  { href: "/waf", label: "AWS WAF", icon: ShieldCheck },
  { href: "/deployments", label: "Deployments", icon: Rocket },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/health-report", label: "Health Report", icon: ClipboardList },
  { href: "/analytics", label: "Analytics", icon: BarChart2 },
  { href: "/incident-analysis", label: "Incident Analysis", icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Settings },
];

function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "flex items-center gap-2 px-3 py-2 w-full rounded-lg text-muted-foreground",
        "hover:bg-muted/50 hover:text-foreground transition-all duration-200",
        className
      )}
    >
      <div className="relative flex-shrink-0">
        <div className={cn(
          "w-8 h-4.5 rounded-full transition-colors duration-300",
          isDark ? "bg-primary/20" : "bg-muted-foreground/20"
        )}>
          <div className={cn(
            "theme-toggle-knob absolute top-0.5 w-3.5 h-3.5 rounded-full bg-foreground shadow-sm transition-all duration-300",
            isDark ? "left-[16px] bg-primary" : "left-0.5"
          )} />
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-xs font-medium tracking-wide">
        {isDark ? "Dark" : "Light"}
      </div>
    </button>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row font-sans">
      
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-card/40 border-r border-border backdrop-blur-xl z-10 sticky top-0 h-screen noise-bg">
        <div className="p-5 flex items-center gap-3 border-b border-border/50 relative z-10">
          <div className="bg-primary shadow-[0_0_15px_rgba(var(--primary),0.5)] p-2 rounded-lg text-primary-foreground flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="font-display font-bold tracking-tight text-sm leading-none">Site Sentinel</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1 font-medium">Control Room</span>
          </div>
        </div>
        
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto relative z-10">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2 px-3">Monitoring</div>
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} className="block group">
                <div className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 relative overflow-hidden",
                  isActive 
                    ? "bg-primary/10 text-primary font-medium" 
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}>
                  {isActive && (
                    <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary rounded-r-full" />
                  )}
                  <item.icon className={cn("w-4 h-4 transition-colors", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                  <span className="text-sm">{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border/50 space-y-2 relative z-10 bg-card/30">
          <div className="flex items-center gap-3 px-3 py-2 bg-muted/30 border border-border/50 rounded-xl">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-foreground font-bold text-xs shadow-inner">
              {user?.username.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-xs font-semibold truncate leading-tight">{user?.username}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mt-0.5">{user?.role}</p>
            </div>
          </div>
          <div className="flex gap-2">
             <ThemeToggle className="flex-1 justify-center" />
             <button 
              onClick={logout}
              className="p-2 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors border border-transparent hover:border-destructive/20"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Header & Content */}
      <div className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 bg-card/80 backdrop-blur-lg border-b border-border sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <div className="bg-primary p-1.5 rounded-md text-primary-foreground">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <span className="font-display font-bold text-sm tracking-tight">Site Sentinel</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTheme(isDark ? "light" : "dark")}
              className="p-2 rounded-lg text-muted-foreground hover:bg-muted"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 -mr-2 text-foreground">
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </header>

        {/* Mobile Flyout Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 top-[60px] bg-background/95 backdrop-blur-xl z-20 p-4 border-b border-border h-[calc(100vh-60px)] overflow-y-auto">
            <nav className="space-y-1">
              {NAV_ITEMS.map((item) => {
                const isActive = location === item.href;
                return (
                  <Link key={item.href} href={item.href} className="block">
                    <div 
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 rounded-xl transition-colors",
                        isActive ? "bg-primary/10 text-primary font-medium" : "text-foreground hover:bg-muted"
                      )}
                    >
                      <item.icon className="w-5 h-5" />
                      {item.label}
                    </div>
                  </Link>
                );
              })}
              <div className="pt-4 mt-4 border-t border-border">
                <button 
                  onClick={logout}
                  className="flex items-center gap-3 px-4 py-3 w-full text-left rounded-xl text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <LogOut className="w-5 h-5" />
                  Sign Out
                </button>
              </div>
            </nav>
          </div>
        )}

        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-x-hidden">
          <div className="max-w-[1600px] mx-auto">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card/90 backdrop-blur-lg border-t border-border flex justify-around p-2 z-20 pb-safe">
        {NAV_ITEMS.slice(0, 5).map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href} className="block flex-1">
              <div className="flex flex-col items-center p-2 rounded-lg hover:bg-muted/50">
                <item.icon className={cn("w-5 h-5 mb-1 transition-colors", isActive ? "text-primary" : "text-muted-foreground")} />
                <span className={cn("text-[10px] font-medium transition-colors", isActive ? "text-primary" : "text-muted-foreground")}>
                  {item.label}
                </span>
              </div>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}