import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { 
  LayoutDashboard, 
  Activity, 
  ShoppingCart, 
  Server, 
  Bell, 
  Settings,
  LogOut,
  ShieldCheck,
  Menu,
  X
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/history", label: "History", icon: Activity },
  { href: "/store", label: "Store", icon: ShoppingCart },
  { href: "/servers", label: "Servers", icon: Server },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r bg-white glass-panel z-10 sticky top-0 h-screen">
        <div className="p-6 flex items-center gap-3 border-b border-border/50">
          <div className="bg-primary/10 p-2 rounded-xl text-primary">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <span className="font-display font-bold tracking-tight text-lg">Site Sentinel</span>
        </div>
        
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} className="block">
                <div className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
                  isActive 
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/20 font-medium" 
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}>
                  <item.icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border/50">
          <div className="flex items-center gap-3 px-4 py-3 bg-secondary/50 rounded-xl mb-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
              {user?.username.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-semibold truncate">{user?.username}</p>
              <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
            </div>
          </div>
          <button 
            onClick={logout}
            className="flex items-center gap-3 px-4 py-3 w-full text-left rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Header & Content */}
      <div className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 bg-white border-b sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary" />
            <span className="font-display font-bold">Site Sentinel</span>
          </div>
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 -mr-2">
            {mobileMenuOpen ? <X /> : <Menu />}
          </button>
        </header>

        {/* Mobile Flyout Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 top-[65px] bg-white z-20 p-4 border-b">
            <nav className="space-y-2">
              {NAV_ITEMS.map((item) => (
                <Link key={item.href} href={item.href} className="block">
                  <div 
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-xl",
                      location === item.href ? "bg-primary text-primary-foreground" : "hover:bg-secondary"
                    )}
                  >
                    <item.icon className="w-5 h-5" />
                    {item.label}
                  </div>
                </Link>
              ))}
              <button 
                onClick={logout}
                className="flex items-center gap-3 px-4 py-3 w-full text-left rounded-xl text-destructive hover:bg-destructive/10 mt-4"
              >
                <LogOut className="w-5 h-5" />
                Sign Out
              </button>
            </nav>
          </div>
        )}

        <main className="flex-1 p-4 md:p-8 overflow-x-hidden">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t flex justify-around p-2 z-20 pb-safe">
        {NAV_ITEMS.slice(0, 5).map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href} className="block">
              <div className="flex flex-col items-center p-2">
                <item.icon className={cn("w-6 h-6 mb-1 transition-colors", isActive ? "text-primary" : "text-muted-foreground")} />
                <span className={cn("text-[10px] font-medium", isActive ? "text-primary" : "text-muted-foreground")}>
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
