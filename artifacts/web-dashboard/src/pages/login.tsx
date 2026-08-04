import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Loader2, KeyRound, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${window.location.origin}${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.message || data.error || "Login failed");
      }
      
      toast({ title: "Welcome back!", description: "Successfully logged in." });
      login(data.token, data.user);
    } catch (err: any) {
      toast({ 
        variant: "destructive", 
        title: "Authentication Failed", 
        description: err.message 
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden dark:noise-bg">
      {/* Abstract geometric background elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-primary/5 blur-[150px] pointer-events-none" />
      
      {/* Decorative background grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none opacity-50" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-[420px] m-4 relative z-10"
      >
        <div className="glass-panel p-8 sm:p-10 rounded-3xl">
          <div className="flex flex-col items-center mb-10">
            <div className="relative mb-6 group">
              <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-primary to-primary/50 opacity-30 blur transition duration-500 group-hover:opacity-50" />
              <div className="relative w-16 h-16 bg-card border border-border rounded-2xl flex items-center justify-center shadow-inner">
                <ShieldCheck className="w-8 h-8 text-primary" />
              </div>
            </div>
            <h1 className="text-3xl font-display font-bold text-foreground tracking-tight">Site Sentinel</h1>
            <p className="text-sm text-muted-foreground mt-2 uppercase tracking-widest font-semibold">Operations Control</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-foreground uppercase tracking-wider ml-1">Operator ID</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                    <User className="w-4 h-4" />
                  </div>
                  <Input 
                    required 
                    autoFocus
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="admin"
                    className="h-12 pl-10 bg-background/50 border-border/50 focus:bg-background transition-colors rounded-xl"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-foreground uppercase tracking-wider ml-1">Access Key</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <Input 
                    required 
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-12 pl-10 bg-background/50 border-border/50 focus:bg-background transition-colors rounded-xl"
                  />
                </div>
              </div>
            </div>
            
            <Button 
              type="submit" 
              className="w-full h-12 text-[15px] font-semibold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5 active:translate-y-0"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" /> Authenticating...
                </span>
              ) : (
                "Initialize Session"
              )}
            </Button>
          </form>
        </div>
        
        <p className="text-center text-xs text-muted-foreground mt-8 font-medium">
          Authorized personnel only. All access is logged.
        </p>
      </motion.div>
    </div>
  );
}