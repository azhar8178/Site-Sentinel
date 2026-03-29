import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useGetAlertConfig, useUpdateAlertConfig, useListUsers, useGetMagentoConfig } from "@workspace/api-client-react";

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const { data: alertConfig } = useGetAlertConfig();
  const updateAlertConfig = useUpdateAlertConfig();
  const { data: magentoConfig } = useGetMagentoConfig();
  const { data: users } = useListUsers({ query: { enabled: user?.role === 'admin' } });

  const [emailForm, setEmailForm] = useState({
    senderEmail: '', recipientEmails: ''
  });

  // Only init once
  useState(() => {
    if (alertConfig) {
      setEmailForm({
        senderEmail: alertConfig.senderEmail || '',
        recipientEmails: alertConfig.recipientEmails || ''
      });
    }
  });

  const handleSaveAlerts = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateAlertConfig.mutateAsync({ data: emailForm });
      toast({ title: "Saved", description: "Alert configuration updated successfully." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  if (user?.role === 'viewer') {
    return (
      <div className="p-8 text-center text-muted-foreground mt-20">
        <h2 className="text-2xl font-bold font-display text-foreground mb-2">Access Denied</h2>
        <p>You do not have permission to view or edit settings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-3xl font-display font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">Configure system behavior and integrations</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* Email Notifications */}
        <Card>
          <CardHeader>
            <CardTitle>Email Alerts</CardTitle>
            <CardDescription>Who receives critical downtime alerts</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveAlerts} className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Sender Email</label>
                <Input 
                  value={emailForm.senderEmail}
                  onChange={e => setEmailForm(f => ({ ...f, senderEmail: e.target.value }))}
                  placeholder="alerts@yourdomain.com" 
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Recipient Emails</label>
                <Input 
                  value={emailForm.recipientEmails}
                  onChange={e => setEmailForm(f => ({ ...f, recipientEmails: e.target.value }))}
                  placeholder="comma separated emails" 
                />
              </div>
              <Button type="submit" disabled={updateAlertConfig.isPending}>
                Save Changes
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Magento Config Preview */}
        <Card>
          <CardHeader>
            <CardTitle>Magento Integration</CardTitle>
            <CardDescription>E-commerce data sync settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Store URL</label>
              <Input value={magentoConfig?.apiUrl || ''} disabled readOnly className="bg-slate-50 text-muted-foreground" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Admin User</label>
              <Input value={magentoConfig?.adminUser || ''} disabled readOnly className="bg-slate-50 text-muted-foreground" />
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${magentoConfig?.isEnabled ? 'bg-success' : 'bg-muted'}`} />
              <span className="text-sm font-medium">Sync is {magentoConfig?.isEnabled ? 'Active' : 'Disabled'}</span>
            </div>
          </CardContent>
        </Card>

        {/* Team Management - Admin Only */}
        {user?.role === 'admin' && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Team Management</CardTitle>
              <CardDescription>Manage who has access to the dashboard</CardDescription>
            </CardHeader>
            <CardContent>
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
                        <td className="px-4 py-3 font-semibold">{u.username}</td>
                        <td className="px-4 py-3 capitalize text-muted-foreground">{u.role}</td>
                        <td className="px-4 py-3 text-right">
                          <Button variant="outline" size="sm" className="bg-white">Edit</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
