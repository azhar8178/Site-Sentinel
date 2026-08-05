import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import {
  useGetAlertConfig, useUpdateAlertConfig,
  useListUsers, useCreateUser, useUpdateUser, useDeleteUser,
  useGetMagentoConfig, useUpdateMagentoConfig, useTestMagentoConnection,
  useTestSmtpConnection, useSendTestEmail,
  useTestSlackConnection, useTestWhatsAppConnection,
  useListSites, useUpdateSite,
  useGetServerAlertConfig, useUpdateServerAlertConfig,
  getListDeploymentSystemsQueryKey, useListDeploymentSystems, useRotateDeploymentSystemSecret,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Mail, MessageSquare, Phone, ShoppingBag, Users, Shield,
  Server, Eye, EyeOff, UserPlus, Trash2, Edit2, Save,
  Zap, Send, LogOut, AlertTriangle, Gauge, BarChart2, FileText, Copy, Check,
  KeyRound,
} from "lucide-react";

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
  const token = localStorage.getItem("sentinel_token");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${base}${url}`, { ...options, headers: { ...headers, ...(options?.headers ?? {}) } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const MASK = "••••••••";

function PasswordInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

function SectionCard({ icon: Icon, title, description, children, className }: {
  icon: any; title: string; description: string; children: React.ReactNode; className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="w-5 h-5 text-primary" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}

function GitLabWebhookSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: systems, isLoading } = useListDeploymentSystems({
    query: {
      queryKey: getListDeploymentSystemsQueryKey(),
      staleTime: 60000,
    },
  });
  const rotateSecret = useRotateDeploymentSystemSecret();
  const [visibleSecret, setVisibleSecret] = useState<{ name: string; value: string } | null>(null);
  const [copied, setCopied] = useState(false);

  if (!user || (user.role !== "admin" && user.role !== "editor")) return null;

  const rotate = async (systemId: number, name: string) => {
    try {
      const result = await rotateSecret.mutateAsync({ systemId });
      setVisibleSecret({ name, value: result.webhookSecret });
      setCopied(false);
      toast({
        title: "Webhook secret generated",
        description: "Copy it into the matching GitLab project webhook now. It will not be shown again.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not generate secret",
        description: error instanceof Error ? error.message : "Try again.",
      });
    }
  };

  const copySecret = async () => {
    if (!visibleSecret) return;
    await navigator.clipboard.writeText(visibleSecret.value);
    setCopied(true);
    toast({ title: "Copied", description: "The webhook secret is ready to paste into GitLab." });
  };

  return (
    <SectionCard icon={KeyRound} title="GitLab Deployment Webhooks" description="Connect GitLab code pushes and deployment events to the audit history">
      <div className="space-y-4">
        <div className="rounded-lg border border-primary/15 bg-primary/5 p-3 text-xs text-muted-foreground">
          Add the generated secret to the matching GitLab project webhook. Enable <strong>Push events</strong> to capture what changed, and <strong>Deployment events</strong> to capture whether it reached an environment. Secrets are hashed in Monit and shown only once after generation.
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading deployment systems...</p>
        ) : (systems ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No deployment systems are configured yet.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {(systems ?? []).map((system) => (
              <div key={system.id} className="rounded-xl border border-border bg-muted/20 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{system.name}</p>
                    <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">{system.systemKey}</p>
                  </div>
                  <span className={`whitespace-nowrap text-[10px] font-semibold ${system.lastWebhookAt ? "text-emerald-600" : "text-muted-foreground"}`}>
                    {system.lastWebhookAt ? "Receiving" : "Not connected"}
                  </span>
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground">
                  POST <span className="font-mono">/api/webhooks/gitlab/{system.systemKey}</span>
                </p>
                {user.role === "admin" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full"
                    onClick={() => rotate(system.id, system.name)}
                    disabled={rotateSecret.isPending}
                  >
                    <KeyRound className="mr-2 h-3.5 w-3.5" />
                    {rotateSecret.isPending ? "Generating..." : system.lastWebhookAt ? "Rotate secret" : "Generate secret"}
                  </Button>
                ) : (
                  <p className="mt-3 text-[10px] text-muted-foreground">Ask an administrator to generate the webhook secret.</p>
                )}
              </div>
            ))}
          </div>
        )}
        {visibleSecret && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-amber-900">Secret for {visibleSecret.name}</p>
                <p className="mt-1 break-all font-mono text-xs text-foreground">{visibleSecret.value}</p>
              </div>
              <Button variant="secondary" size="sm" onClick={copySecret} className="shrink-0">
                {copied ? <Check className="mr-2 h-3.5 w-3.5 text-emerald-600" /> : <Copy className="mr-2 h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy secret"}
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-amber-800">
              This value is shown once. If it is lost, rotate it again before configuring GitLab.
            </p>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

export default function Settings() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: config } = useGetAlertConfig();
  const updateConfig = useUpdateAlertConfig();
  const { data: sites } = useListSites();
  const updateSite = useUpdateSite();
  const testSmtp = useTestSmtpConnection();
  const sendTestEmail = useSendTestEmail();
  const testSlack = useTestSlackConnection();
  const testWhatsApp = useTestWhatsAppConnection();
  const { data: magentoConfig } = useGetMagentoConfig();
  const updateMagento = useUpdateMagentoConfig();
  const testMagento = useTestMagentoConnection();
  const { data: users } = useListUsers({ query: { enabled: user?.role === "admin" } });
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const { data: serverAlertConfig } = useGetServerAlertConfig();
  const updateServerAlertConfig = useUpdateServerAlertConfig();

  const [isEnabled, setIsEnabled] = useState(true);
  const [senderEmail, setSenderEmail] = useState("");
  const [recipientEmails, setRecipientEmails] = useState("");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUsername, setSmtpUsername] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpSecure, setSmtpSecure] = useState(false);

  const [slackEnabled, setSlackEnabled] = useState(false);
  const [slackBotToken, setSlackBotToken] = useState("");
  const [slackChannel, setSlackChannel] = useState("");

  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [whatsappApiToken, setWhatsappApiToken] = useState("");
  const [whatsappPhoneNumberId, setWhatsappPhoneNumberId] = useState("");
  const [whatsappRecipients, setWhatsappRecipients] = useState("");

  const [magApiUrl, setMagApiUrl] = useState("");
  const [magAdminUser, setMagAdminUser] = useState("");
  const [magAdminPass, setMagAdminPass] = useState("");
  const [magApiToken, setMagApiToken] = useState("");
  const [magEnabled, setMagEnabled] = useState(false);

  const [thresholds, setThresholds] = useState<Record<number, string>>({});

  const [serverAlertsEnabled, setServerAlertsEnabled] = useState(true);
  const [cpuThreshold, setCpuThreshold] = useState("90");
  const [ramThreshold, setRamThreshold] = useState("90");
  const [diskThreshold, setDiskThreshold] = useState("95");
  const [offlineTimeout, setOfflineTimeout] = useState("5");

  const [showAddUser, setShowAddUser] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"viewer" | "editor" | "admin">("viewer");
  const [editingUser, setEditingUser] = useState<{ id: number; username: string; role: string } | null>(null);
  const [editRole, setEditRole] = useState<"viewer" | "editor" | "admin">("viewer");
  const [resetPassword, setResetPassword] = useState("");

  const [gaClientId, setGaClientId] = useState("");
  const [gaClientSecret, setGaClientSecret] = useState("");
  const [gaSaving, setGaSaving] = useState(false);
  const [copiedCallback, setCopiedCallback] = useState(false);

  const [hrCompanyName, setHrCompanyName] = useState("Love Furniture");
  const [hrSaving, setHrSaving] = useState(false);

  const { data: gaConfig } = useQuery({
    queryKey: ["/api/config/google-analytics"],
    queryFn: () => apiFetch<{ clientId: string; clientSecret: string; hasCredentials: boolean }>("/api/config/google-analytics"),
  });

  const { data: hrConfig } = useQuery({
    queryKey: ["/api/config/health-report"],
    queryFn: () => apiFetch<{ companyName: string }>("/api/config/health-report"),
  });

  const callbackUrl = (() => {
    const base = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
    return `${window.location.origin}${base}/api/analytics/google/callback`;
  })();

  useEffect(() => {
    if (config) {
      setIsEnabled(config.isEnabled);
      setSenderEmail(config.senderEmail);
      setRecipientEmails(config.recipientEmails);
      setSmtpHost(config.smtpHost);
      setSmtpPort(String(config.smtpPort));
      setSmtpUsername(config.smtpUsername);
      setSmtpPassword(config.smtpPassword);
      setSmtpSecure(config.smtpSecure);
      setSlackEnabled(config.slackEnabled);
      setSlackBotToken(config.slackBotToken);
      setSlackChannel(config.slackChannel);
      setWhatsappEnabled(config.whatsappEnabled);
      setWhatsappApiToken(config.whatsappApiToken);
      setWhatsappPhoneNumberId(config.whatsappPhoneNumberId);
      setWhatsappRecipients(config.whatsappRecipients);
    }
  }, [config?.id]);

  useEffect(() => {
    if (magentoConfig) {
      setMagApiUrl(magentoConfig.apiUrl);
      setMagAdminUser(magentoConfig.adminUser);
      setMagAdminPass(magentoConfig.adminPass);
      setMagApiToken(magentoConfig.apiToken);
      setMagEnabled(magentoConfig.isEnabled);
    }
  }, [magentoConfig?.id]);

  useEffect(() => {
    if (sites) {
      const t: Record<number, string> = {};
      sites.forEach(s => { t[s.id] = String(s.slowThresholdMs); });
      setThresholds(t);
    }
  }, [sites?.length]);

  useEffect(() => {
    if (serverAlertConfig) {
      setServerAlertsEnabled(serverAlertConfig.isEnabled);
      setCpuThreshold(String(serverAlertConfig.cpuThreshold));
      setRamThreshold(String(serverAlertConfig.ramThreshold));
      setDiskThreshold(String(serverAlertConfig.diskThreshold));
      setOfflineTimeout(String(serverAlertConfig.offlineTimeoutMinutes));
    }
  }, [serverAlertConfig?.id]);

  useEffect(() => {
    if (gaConfig) {
      setGaClientId(gaConfig.clientId);
      setGaClientSecret(gaConfig.clientSecret);
    }
  }, [gaConfig?.clientId]);

  useEffect(() => {
    if (hrConfig) {
      setHrCompanyName(hrConfig.companyName);
    }
  }, [hrConfig?.companyName]);

  const handleSaveGoogleAnalytics = async () => {
    setGaSaving(true);
    try {
      await apiFetch("/api/config/google-analytics", {
        method: "PUT",
        body: JSON.stringify({ clientId: gaClientId, clientSecret: gaClientSecret }),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/config/google-analytics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/google/status"] });
      toast({ title: "Saved", description: "Google Analytics credentials updated." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
      setGaSaving(false);
    }
  };

  const handleSaveHealthReport = async () => {
    setHrSaving(true);
    try {
      await apiFetch("/api/config/health-report", {
        method: "PUT",
        body: JSON.stringify({ companyName: hrCompanyName }),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/config/health-report"] });
      queryClient.invalidateQueries({ queryKey: ["/api/health-report"] });
      toast({ title: "Saved", description: "Health Report configuration updated." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
      setHrSaving(false);
    }
  };

  const handleCopyCallback = () => {
    navigator.clipboard.writeText(callbackUrl).then(() => {
      setCopiedCallback(true);
      setTimeout(() => setCopiedCallback(false), 2000);
    });
  };

  const handleSaveAlerts = async () => {
    try {
      await updateConfig.mutateAsync({
        data: {
          isEnabled, senderEmail, recipientEmails,
          smtpHost, smtpPort: Number(smtpPort) || 587, smtpUsername, smtpPassword, smtpSecure,
          slackEnabled, slackBotToken, slackChannel,
          whatsappEnabled, whatsappApiToken, whatsappPhoneNumberId, whatsappRecipients,
        },
      });
      for (const site of sites ?? []) {
        const threshold = Number(thresholds[site.id]);
        if (!isNaN(threshold) && threshold !== site.slowThresholdMs) {
          await updateSite.mutateAsync({ siteId: site.id, data: { slowThresholdMs: threshold } });
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
      toast({ title: "Saved", description: "Alert configuration updated." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleTestSmtp = async () => {
    try {
      const result = await testSmtp.mutateAsync({
        data: { smtpHost, smtpPort: Number(smtpPort) || 587, smtpUsername, smtpPassword, smtpSecure },
      });
      toast({ title: result.success ? "Connected" : "Failed", description: result.message || (result.success ? "SMTP connection successful" : "Connection failed") });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleSendTestEmail = async () => {
    try {
      const result = await sendTestEmail.mutateAsync({ data: {} });
      toast({ title: result.success ? "Sent" : "Failed", description: result.message || "Test email sent" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleTestSlack = async () => {
    try {
      const result = await testSlack.mutateAsync({ data: { slackBotToken, slackChannel } });
      toast({ title: result.success ? "Connected" : "Failed", description: result.message || "Slack test complete" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleTestWhatsApp = async () => {
    try {
      const result = await testWhatsApp.mutateAsync({ data: { whatsappApiToken, whatsappPhoneNumberId, testRecipient: whatsappRecipients.split(",")[0]?.trim() } });
      toast({ title: result.success ? "Connected" : "Failed", description: result.message || "WhatsApp test complete" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleSaveMagento = async () => {
    try {
      await updateMagento.mutateAsync({
        data: { apiUrl: magApiUrl, adminUser: magAdminUser, adminPass: magAdminPass, apiToken: magApiToken, isEnabled: magEnabled },
      });
      queryClient.invalidateQueries({ queryKey: ["/api/config/magento"] });
      toast({ title: "Saved", description: "Magento settings updated." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleTestMagento = async () => {
    try {
      const result = await testMagento.mutateAsync({
        data: { apiUrl: magApiUrl, adminUser: magAdminUser, adminPass: magAdminPass, apiToken: magApiToken },
      });
      toast({ title: result.success ? "Connected" : "Failed", description: result.message || "Magento test complete" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleSaveServerAlerts = async () => {
    try {
      await updateServerAlertConfig.mutateAsync({
        data: {
          isEnabled: serverAlertsEnabled,
          cpuThreshold: Number(cpuThreshold),
          ramThreshold: Number(ramThreshold),
          diskThreshold: Number(diskThreshold),
          offlineTimeoutMinutes: Number(offlineTimeout),
        },
      });
      queryClient.invalidateQueries({ queryKey: ["/api/config/server-alerts"] });
      toast({ title: "Saved", description: "Server alert thresholds updated." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleCreateUser = async () => {
    if (!newUsername.trim() || !newPassword.trim()) {
      toast({ variant: "destructive", title: "Error", description: "Username and password are required." });
      return;
    }
    try {
      await createUser.mutateAsync({ data: { username: newUsername.trim(), password: newPassword, role: newRole } });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setShowAddUser(false);
      setNewUsername("");
      setNewPassword("");
      setNewRole("viewer");
      toast({ title: "Created", description: "User created successfully." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    try {
      const data: any = { role: editRole };
      if (resetPassword.trim().length > 0) {
        if (resetPassword.length < 6) {
          toast({ variant: "destructive", title: "Error", description: "Password must be at least 6 characters." });
          return;
        }
        data.password = resetPassword;
      }
      await updateUser.mutateAsync({ userId: editingUser.id, data });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setEditingUser(null);
      setResetPassword("");
      toast({ title: "Updated", description: "User updated successfully." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleDeleteUser = async (userId: number, username: string) => {
    if (!confirm(`Remove "${username}"? This cannot be undone.`)) return;
    try {
      await deleteUser.mutateAsync({ userId });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Removed", description: `${username} has been removed.` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  if (user?.role === "viewer") {
    return (
      <div className="p-8 text-center text-muted-foreground mt-20">
        <Shield className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
        <h2 className="text-2xl font-bold font-display text-foreground mb-2">Access Denied</h2>
        <p>You do not have permission to view or edit settings.</p>
      </div>
    );
  }

  const roleColors: Record<string, string> = {
    admin: "bg-red-50 text-red-700 border-red-200",
    editor: "bg-amber-50 text-amber-700 border-amber-200",
    viewer: "bg-blue-50 text-blue-700 border-blue-200",
  };

  return (
    <div className="space-y-8 max-w-5xl pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Settings</h1>
          <p className="text-muted-foreground mt-1">Configure system behavior and integrations</p>
        </div>
        <Button variant="outline" onClick={logout} className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/5">
          <LogOut className="w-4 h-4" /> Sign Out
        </Button>
      </div>

      {/* Email Alerts */}
      <SectionCard icon={Mail} title="Email Alerts" description="SMTP configuration and notification recipients">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Enable Email Alerts</label>
            <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Sender Email">
              <Input value={senderEmail} onChange={e => setSenderEmail(e.target.value)} placeholder="alerts@yourdomain.com" />
            </Field>
            <Field label="Recipient Emails">
              <Input value={recipientEmails} onChange={e => setRecipientEmails(e.target.value)} placeholder="comma separated emails" />
            </Field>
          </div>

          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-3">SMTP Server</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="SMTP Host">
                <Input value={smtpHost} onChange={e => setSmtpHost(e.target.value)} placeholder="smtp.gmail.com" />
              </Field>
              <Field label="SMTP Port">
                <Input value={smtpPort} onChange={e => setSmtpPort(e.target.value)} placeholder="587" />
              </Field>
              <Field label="SMTP Username">
                <Input value={smtpUsername} onChange={e => setSmtpUsername(e.target.value)} placeholder="your@email.com" />
              </Field>
              <Field label="SMTP Password">
                <PasswordInput value={smtpPassword} onChange={setSmtpPassword} placeholder="App password" />
              </Field>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <Switch checked={smtpSecure} onCheckedChange={setSmtpSecure} />
              <label className="text-sm">Use SSL/TLS</label>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleSaveAlerts} disabled={updateConfig.isPending} className="gap-2">
              <Save className="w-4 h-4" /> Save Alert Settings
            </Button>
            <Button variant="outline" onClick={handleTestSmtp} disabled={testSmtp.isPending} className="gap-2">
              <Zap className="w-4 h-4" /> Test SMTP
            </Button>
            <Button variant="outline" onClick={handleSendTestEmail} disabled={sendTestEmail.isPending} className="gap-2">
              <Send className="w-4 h-4" /> Send Test Email
            </Button>
          </div>
        </div>
      </SectionCard>

      {/* Slack */}
      <SectionCard icon={MessageSquare} title="Slack Notifications" description="Send alerts using your Slack bot">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Enable Slack</label>
            <Switch checked={slackEnabled} onCheckedChange={setSlackEnabled} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Bot Token">
              <PasswordInput value={slackBotToken} onChange={setSlackBotToken} placeholder="xoxb-your-bot-token" />
              <p className="text-xs text-muted-foreground mt-1">From api.slack.com → Your App → OAuth & Permissions → Bot User OAuth Token</p>
            </Field>
            <Field label="Channel ID">
              <Input value={slackChannel} onChange={e => setSlackChannel(e.target.value)} placeholder="C01ABCDEF23" />
              <p className="text-xs text-muted-foreground mt-1">Right-click channel → View channel details → copy the Channel ID at bottom</p>
            </Field>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSaveAlerts} disabled={updateConfig.isPending} className="gap-2">
              <Save className="w-4 h-4" /> Save
            </Button>
            <Button variant="outline" onClick={handleTestSlack} disabled={testSlack.isPending} className="gap-2">
              <Zap className="w-4 h-4" /> Test Slack
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Bot needs <code className="bg-slate-100 px-1 rounded">chat:write</code> scope. Invite the bot to the channel with <code className="bg-slate-100 px-1 rounded">/invite @YourBot</code></p>
        </div>
      </SectionCard>

      {/* WhatsApp */}
      <SectionCard icon={Phone} title="WhatsApp Notifications" description="Send alerts via WhatsApp Business Cloud API">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Enable WhatsApp</label>
            <Switch checked={whatsappEnabled} onCheckedChange={setWhatsappEnabled} />
          </div>
          <div className="grid grid-cols-1 gap-4">
            <Field label="Permanent Access Token">
              <PasswordInput value={whatsappApiToken} onChange={setWhatsappApiToken} placeholder="EAAxxxxxxx..." />
              <p className="text-xs text-muted-foreground mt-1">From developers.facebook.com → Your App → WhatsApp → API Setup → generate a permanent token via System Users</p>
            </Field>
            <Field label="Phone Number ID">
              <Input value={whatsappPhoneNumberId} onChange={e => setWhatsappPhoneNumberId(e.target.value)} placeholder="123456789012345" />
              <p className="text-xs text-muted-foreground mt-1">From WhatsApp → API Setup → Phone Number ID (not the phone number itself)</p>
            </Field>
            <Field label="Recipient Phone Numbers">
              <Input value={whatsappRecipients} onChange={e => setWhatsappRecipients(e.target.value)} placeholder="+353851234567, +447700123456" />
              <p className="text-xs text-muted-foreground mt-1">International format with country code. Separate multiple numbers with commas</p>
            </Field>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSaveAlerts} disabled={updateConfig.isPending} className="gap-2">
              <Save className="w-4 h-4" /> Save
            </Button>
            <Button variant="outline" onClick={handleTestWhatsApp} disabled={testWhatsApp.isPending} className="gap-2">
              <Zap className="w-4 h-4" /> Test WhatsApp
            </Button>
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <p><strong>Quick setup:</strong></p>
            <p>1. Go to <a href="https://developers.facebook.com" target="_blank" className="text-primary underline">developers.facebook.com</a> → Create App → Business type → Add WhatsApp product</p>
            <p>2. In API Setup, you get a temporary token and test phone number. Use these to verify it works</p>
            <p>3. For permanent use: Business Settings → System Users → create one → generate a permanent token with <code className="bg-slate-100 px-1 rounded">whatsapp_business_messaging</code> permission</p>
            <p>4. Add recipient numbers in WhatsApp → API Setup → "To" field to whitelist them (only needed for test numbers)</p>
          </div>
        </div>
      </SectionCard>

      {/* Site Thresholds */}
      <SectionCard icon={AlertTriangle} title="Site Slow Thresholds" description="Configure response time thresholds per site (ms)">
        <div className="space-y-4">
          {sites?.map(site => (
            <div key={site.id} className="flex items-center gap-4">
              <label className="text-sm font-medium min-w-[180px]">{site.name}</label>
              <Input
                type="number"
                className="w-32"
                value={thresholds[site.id] || ""}
                onChange={e => setThresholds(prev => ({ ...prev, [site.id]: e.target.value }))}
              />
              <span className="text-xs text-muted-foreground">ms</span>
            </div>
          ))}
          <Button onClick={handleSaveAlerts} disabled={updateConfig.isPending} className="gap-2">
            <Save className="w-4 h-4" /> Save Thresholds
          </Button>
        </div>
      </SectionCard>

      {/* Server Alert Thresholds */}
      <SectionCard icon={Gauge} title="Server Alert Thresholds" description="Configure alert thresholds for server vitals">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Enable Server Alerts</label>
            <Switch checked={serverAlertsEnabled} onCheckedChange={setServerAlertsEnabled} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="CPU Threshold (%)">
              <Input type="number" value={cpuThreshold} onChange={e => setCpuThreshold(e.target.value)} />
            </Field>
            <Field label="RAM Threshold (%)">
              <Input type="number" value={ramThreshold} onChange={e => setRamThreshold(e.target.value)} />
            </Field>
            <Field label="Disk Threshold (%)">
              <Input type="number" value={diskThreshold} onChange={e => setDiskThreshold(e.target.value)} />
            </Field>
            <Field label="Offline Timeout (minutes)">
              <Input type="number" value={offlineTimeout} onChange={e => setOfflineTimeout(e.target.value)} />
            </Field>
          </div>
          <Button onClick={handleSaveServerAlerts} disabled={updateServerAlertConfig.isPending} className="gap-2">
            <Save className="w-4 h-4" /> Save Server Thresholds
          </Button>
        </div>
      </SectionCard>

      {/* Magento */}
      <SectionCard icon={ShoppingBag} title="Magento Integration" description="Connect to your Magento store for order and cart tracking">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Enable Sync</label>
            <Switch checked={magEnabled} onCheckedChange={setMagEnabled} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Store API URL">
              <Input value={magApiUrl} onChange={e => setMagApiUrl(e.target.value)} placeholder="https://your-store.com" />
            </Field>
            <Field label="Admin Username">
              <Input value={magAdminUser} onChange={e => setMagAdminUser(e.target.value)} placeholder="admin" />
            </Field>
            <Field label="Admin Password">
              <PasswordInput value={magAdminPass} onChange={setMagAdminPass} placeholder="Admin password" />
            </Field>
            <Field label="API Token (optional)">
              <PasswordInput value={magApiToken} onChange={setMagApiToken} placeholder="Integration token" />
            </Field>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSaveMagento} disabled={updateMagento.isPending} className="gap-2">
              <Save className="w-4 h-4" /> Save Magento
            </Button>
            <Button variant="outline" onClick={handleTestMagento} disabled={testMagento.isPending} className="gap-2">
              <Zap className="w-4 h-4" /> Test Connection
            </Button>
          </div>
        </div>
      </SectionCard>

      <GitLabWebhookSettings />

      {/* Google Analytics */}
      <SectionCard icon={BarChart2} title="Google Analytics" description="OAuth credentials for the Analytics integration — stored securely in the database">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Client ID">
              <Input value={gaClientId} onChange={e => setGaClientId(e.target.value)} placeholder="1234567890-abc...apps.googleusercontent.com" />
              <p className="text-xs text-muted-foreground mt-1">From Google Cloud Console → Credentials → OAuth 2.0 Client ID</p>
            </Field>
            <Field label="Client Secret">
              <PasswordInput value={gaClientSecret} onChange={setGaClientSecret} placeholder="GOCSPX-..." />
              <p className="text-xs text-muted-foreground mt-1">From the same OAuth 2.0 Client — keep this private</p>
            </Field>
          </div>
          <Field label="Authorized Redirect URI (copy into Google Cloud Console)">
            <div className="flex gap-2">
              <Input value={callbackUrl} readOnly className="bg-muted font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={handleCopyCallback} className="flex-shrink-0">
                {copiedCallback ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Add this URL under Authorized Redirect URIs in your Google Cloud OAuth app before connecting</p>
          </Field>
          <div className="border-t pt-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 space-y-1 mb-4">
              <p className="font-semibold">Setup steps:</p>
              <ol className="list-decimal list-inside space-y-0.5">
                <li>Go to <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">console.cloud.google.com</a> → Enable Google Analytics Data API &amp; Admin API</li>
                <li>Credentials → Create OAuth 2.0 Client ID (Web application type)</li>
                <li>Add the Redirect URI above, then paste the Client ID and Secret here</li>
                <li>Go to Analytics → Sign in with Google to connect your GA4 account</li>
              </ol>
            </div>
            <Button onClick={handleSaveGoogleAnalytics} disabled={gaSaving} className="gap-2">
              <Save className="w-4 h-4" /> Save Credentials
            </Button>
          </div>
        </div>
      </SectionCard>

      {/* Health Report */}
      <SectionCard icon={FileText} title="Health Report" description="Configure report branding">
        <div className="space-y-6">
          <Field label="Company / Report Name">
            <Input value={hrCompanyName} onChange={e => setHrCompanyName(e.target.value)} placeholder="Love Furniture" />
            <p className="text-xs text-muted-foreground mt-1">Displayed in the Health Report document header</p>
          </Field>

          <div className="border-t pt-4">
            <Button onClick={handleSaveHealthReport} disabled={hrSaving} className="gap-2">
              <Save className="w-4 h-4" /> Save Health Report Settings
            </Button>
          </div>
        </div>
      </SectionCard>

      {/* Team Management */}
      {user?.role === "admin" && (
        <SectionCard icon={Users} title="Team Management" description="Manage who has access to the dashboard">
          <div className="space-y-4">
            <Button variant="outline" onClick={() => setShowAddUser(true)} className="gap-2">
              <UserPlus className="w-4 h-4" /> Add Team Member
            </Button>

            {showAddUser && (
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="p-4 space-y-4">
                  <p className="font-semibold text-sm">New Team Member</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Field label="Username">
                      <Input value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="username" />
                    </Field>
                    <Field label="Password">
                      <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min 6 characters" />
                    </Field>
                    <Field label="Role">
                      <div className="flex gap-1">
                        {(["viewer", "editor", "admin"] as const).map(r => (
                          <button
                            key={r}
                            onClick={() => setNewRole(r)}
                            className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors capitalize ${
                              newRole === r ? "bg-primary text-white border-primary" : "bg-white border-border hover:bg-secondary"
                            }`}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    </Field>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleCreateUser} disabled={createUser.isPending}>Create</Button>
                    <Button size="sm" variant="outline" onClick={() => setShowAddUser(false)}>Cancel</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="border rounded-xl overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-muted-foreground border-b">
                  <tr>
                    <th className="px-4 py-3 font-medium">Username</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {users?.map(u => (
                    <tr key={u.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-semibold">
                        {u.username}
                        {u.id === user?.id && <span className="text-xs text-muted-foreground ml-2">(you)</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border capitalize ${roleColors[u.role] || roleColors.viewer}`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {u.id !== user?.id && (
                          <div className="flex gap-1 justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditingUser({ id: u.id, username: u.username, role: u.role });
                                setEditRole(u.role as any);
                                setResetPassword("");
                              }}
                              className="gap-1"
                            >
                              <Edit2 className="w-3 h-3" /> Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteUser(u.id, u.username)}
                              className="gap-1 text-destructive hover:text-destructive hover:bg-destructive/5"
                            >
                              <Trash2 className="w-3 h-3" /> Remove
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {editingUser && (
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="p-4 space-y-4">
                  <p className="font-semibold text-sm">Edit {editingUser.username}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Field label="Role">
                      <div className="flex gap-1">
                        {(["viewer", "editor", "admin"] as const).map(r => (
                          <button
                            key={r}
                            onClick={() => setEditRole(r)}
                            className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors capitalize ${
                              editRole === r ? "bg-primary text-white border-primary" : "bg-white border-border hover:bg-secondary"
                            }`}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    </Field>
                    <Field label="Reset Password (leave empty to keep)">
                      <Input type="password" value={resetPassword} onChange={e => setResetPassword(e.target.value)} placeholder="New password (optional)" />
                    </Field>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleUpdateUser} disabled={updateUser.isPending}>Save Changes</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingUser(null)}>Cancel</Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
