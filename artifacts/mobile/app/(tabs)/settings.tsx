import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TextInput,
  Pressable,
  Switch,
  Alert,
  ActivityIndicator,
  Platform,
  Animated,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import {
  useGetAlertConfig,
  useUpdateAlertConfig,
  useListSites,
  useUpdateSite,
  useTestSmtpConnection,
  useSendTestEmail,
  useTestSlackConnection,
  useTestWhatsAppConnection,
  useGetMagentoConfig,
  useUpdateMagentoConfig,
  useTestMagentoConnection,
  useListUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
} from "@workspace/api-client-react";
import type { CreateUserInputRole, UpdateUserInputRole, UpdateUserInput } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";

type ToastType = "success" | "error" | "info";

function useToast() {
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((message: string, type: ToastType = "info") => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ message, type });
    const useNative = Platform.OS !== "web";
    Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: useNative }).start();
    timerRef.current = setTimeout(() => {
      Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: useNative }).start(() => {
        setToast(null);
      });
    }, 4000);
  }, [fadeAnim]);

  const ToastBanner = toast ? (
    <Animated.View
      style={[
        styles.toastBanner,
        toast.type === "success" && styles.toastSuccess,
        toast.type === "error" && styles.toastError,
        toast.type === "info" && styles.toastInfo,
        { opacity: fadeAnim },
      ]}
    >
      <Feather
        name={toast.type === "success" ? "check-circle" : toast.type === "error" ? "alert-circle" : "info"}
        size={16}
        color={toast.type === "success" ? "#065F46" : toast.type === "error" ? "#991B1B" : "#1E40AF"}
      />
      <Text
        style={[
          styles.toastText,
          toast.type === "success" && styles.toastTextSuccess,
          toast.type === "error" && styles.toastTextError,
          toast.type === "info" && styles.toastTextInfo,
        ]}
      >
        {toast.message}
      </Text>
    </Animated.View>
  ) : null;

  return { show, ToastBanner };
}

function showAlert(title: string, message: string, buttons?: Array<{ text: string; style?: string; onPress?: () => void }>) {
  if (Platform.OS === "web") {
    if (buttons && buttons.length > 1) {
      if (window.confirm(`${title}\n\n${message}`)) {
        const action = buttons.find((b) => b.style === "destructive" || b.text !== "Cancel");
        action?.onPress?.();
      }
    } else {
      window.alert(`${title}\n\n${message}`);
    }
  } else {
    Alert.alert(title, message, buttons as any);
  }
}

function SectionHeader({ icon, title, description }: { icon: string; title: string; description?: string }) {
  return (
    <>
      <View style={styles.sectionHeader}>
        <Feather name={icon as any} size={18} color={Colors.light.text} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {description && <Text style={styles.sectionDescription}>{description}</Text>}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function PasswordField({ label, value, onChangeText, placeholder }: { label: string; value: string; onChangeText: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <Field label={label}>
      <View style={styles.passwordContainer}>
        <TextInput
          style={[styles.textInput, styles.passwordInput]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder || ""}
          placeholderTextColor={Colors.light.textSecondary}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable style={styles.eyeButton} onPress={() => setShow(!show)}>
          <Feather name={show ? "eye-off" : "eye"} size={18} color={Colors.light.textSecondary} />
        </Pressable>
      </View>
    </Field>
  );
}

function TestButton({ label, onPress, isPending, disabled, icon }: { label: string; onPress: () => void; isPending: boolean; disabled?: boolean; icon?: string }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.testButton, pressed && styles.testButtonPressed]}
      onPress={onPress}
      disabled={isPending || disabled}
    >
      {isPending ? (
        <ActivityIndicator size="small" color={Colors.light.tint} />
      ) : (
        <>
          <Feather name={(icon || "zap") as any} size={16} color={Colors.light.tint} />
          <Text style={styles.testButtonText}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

function StatusDot({ connected }: { connected: boolean }) {
  return (
    <View style={[styles.statusDot, { backgroundColor: connected ? Colors.light.success : Colors.light.textSecondary }]} />
  );
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

const ROLE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  admin: { bg: "#FEF2F2", text: "#991B1B", border: "#FECACA" },
  editor: { bg: "#FFFBEB", text: "#92400E", border: "#FDE68A" },
  viewer: { bg: "#EFF6FF", text: "#1E40AF", border: "#BFDBFE" },
};

function RoleBadge({ role }: { role: string }) {
  const colors = ROLE_COLORS[role] || ROLE_COLORS.viewer;
  return (
    <View style={[styles.roleBadge, { backgroundColor: colors.bg, borderColor: colors.border }]}>
      <Text style={[styles.roleBadgeText, { color: colors.text }]}>{ROLE_LABELS[role] || role}</Text>
    </View>
  );
}

function TeamSection({ showToast }: { showToast: (msg: string, type: ToastType) => void }) {
  const { user, canManageUsers } = useAuth();
  const queryClient = useQueryClient();
  const { data: users, isLoading } = useListUsers({ query: { enabled: canManageUsers } });
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  const [showAddModal, setShowAddModal] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<CreateUserInputRole>("viewer");
  const [editingUser, setEditingUser] = useState<{ id: number; username: string; role: string } | null>(null);
  const [editRole, setEditRole] = useState<UpdateUserInputRole>("viewer");
  const [resetPassword, setResetPassword] = useState("");

  const handleCreateUser = async () => {
    if (!newUsername.trim() || !newPassword.trim()) {
      showToast("Username and password are required", "error");
      return;
    }
    try {
      await createUser.mutateAsync({
        data: { username: newUsername.trim(), password: newPassword, role: newRole },
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setShowAddModal(false);
      setNewUsername("");
      setNewPassword("");
      setNewRole("viewer");
      showToast("User created successfully", "success");
    } catch (err: any) {
      showToast(err?.message || "Failed to create user", "error");
    }
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    try {
      const data: UpdateUserInput = { role: editRole };
      if (resetPassword.trim().length > 0) {
        if (resetPassword.length < 6) {
          showToast("Password must be at least 6 characters", "error");
          return;
        }
        data.password = resetPassword;
      }
      await updateUser.mutateAsync({ userId: editingUser.id, data });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setEditingUser(null);
      setResetPassword("");
      showToast("User updated successfully", "success");
    } catch (err: any) {
      showToast(err?.message || "Failed to update user", "error");
    }
  };

  const handleDeleteUser = (userId: number, username: string) => {
    showAlert("Remove User", `Are you sure you want to remove "${username}"? This action cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteUser.mutateAsync({ userId });
            queryClient.invalidateQueries({ queryKey: ["/api/users"] });
            showToast("User removed", "success");
          } catch (err: any) {
            showToast(err?.message || "Failed to remove user", "error");
          }
        },
      },
    ]);
  };

  if (!canManageUsers) {
    return null;
  }

  if (isLoading) {
    return (
      <View style={styles.section}>
        <SectionHeader icon="users" title="Team" description="Manage team members and permissions" />
        <ActivityIndicator size="small" color={Colors.light.tint} style={{ marginTop: 16 }} />
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <SectionHeader icon="users" title="Team" description="Manage team members and permissions" />

      {canManageUsers && (
        <Pressable
          style={({ pressed }) => [styles.addUserButton, pressed && { opacity: 0.7 }]}
          onPress={() => setShowAddModal(true)}
        >
          <Feather name="user-plus" size={16} color={Colors.light.tint} />
          <Text style={styles.addUserButtonText}>Add Team Member</Text>
        </Pressable>
      )}

      {(users ?? []).map((u) => (
        <View key={u.id} style={styles.userCard}>
          <View style={styles.userInfo}>
            <View style={styles.userNameRow}>
              <Feather name="user" size={16} color={Colors.light.textSecondary} />
              <Text style={styles.userName}>{u.username}</Text>
              {u.id === user?.id && <Text style={styles.youBadge}>(you)</Text>}
            </View>
            <RoleBadge role={u.role} />
          </View>
          {canManageUsers && u.id !== user?.id && (
            <View style={styles.userActions}>
              <Pressable
                style={({ pressed }) => [styles.userActionBtn, pressed && { opacity: 0.7 }]}
                onPress={() => {
                  setEditingUser({ id: u.id, username: u.username, role: u.role });
                  setEditRole(u.role as UpdateUserInputRole);
                  setResetPassword("");
                }}
              >
                <Feather name="edit-2" size={14} color={Colors.light.tint} />
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.userActionBtn, pressed && { opacity: 0.7 }]}
                onPress={() => handleDeleteUser(u.id, u.username)}
              >
                <Feather name="trash-2" size={14} color="#dc3545" />
              </Pressable>
            </View>
          )}
        </View>
      ))}

      <Modal visible={showAddModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowAddModal(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Add Team Member</Text>

            <Field label="Username">
              <TextInput
                style={styles.textInput}
                value={newUsername}
                onChangeText={setNewUsername}
                placeholder="username"
                placeholderTextColor={Colors.light.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </Field>

            <Field label="Temporary Password">
              <TextInput
                style={styles.textInput}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Min 6 characters"
                placeholderTextColor={Colors.light.textSecondary}
                secureTextEntry
              />
            </Field>

            <Field label="Role">
              <View style={styles.roleSelector}>
                {(["viewer", "editor", "admin"] as const).map((r) => (
                  <Pressable
                    key={r}
                    style={[styles.roleOption, newRole === r && styles.roleOptionSelected]}
                    onPress={() => setNewRole(r)}
                  >
                    <Text style={[styles.roleOptionText, newRole === r && styles.roleOptionTextSelected]}>
                      {ROLE_LABELS[r]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Field>

            <View style={styles.modalButtons}>
              <Pressable
                style={({ pressed }) => [styles.modalCancelBtn, pressed && { opacity: 0.7 }]}
                onPress={() => setShowAddModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.modalConfirmBtn, pressed && { opacity: 0.85 }]}
                onPress={handleCreateUser}
                disabled={createUser.isPending}
              >
                {createUser.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalConfirmText}>Create</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!editingUser} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setEditingUser(null)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Edit {editingUser?.username}</Text>

            <Field label="Role">
              <View style={styles.roleSelector}>
                {(["viewer", "editor", "admin"] as const).map((r) => (
                  <Pressable
                    key={r}
                    style={[styles.roleOption, editRole === r && styles.roleOptionSelected]}
                    onPress={() => setEditRole(r)}
                  >
                    <Text style={[styles.roleOptionText, editRole === r && styles.roleOptionTextSelected]}>
                      {ROLE_LABELS[r]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Field>

            <Field label="Reset Password (leave empty to keep current)">
              <TextInput
                style={styles.textInput}
                value={resetPassword}
                onChangeText={setResetPassword}
                placeholder="New password (optional)"
                placeholderTextColor={Colors.light.textSecondary}
                secureTextEntry
              />
            </Field>

            <View style={styles.modalButtons}>
              <Pressable
                style={({ pressed }) => [styles.modalCancelBtn, pressed && { opacity: 0.7 }]}
                onPress={() => setEditingUser(null)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.modalConfirmBtn, pressed && { opacity: 0.85 }]}
                onPress={handleUpdateUser}
                disabled={updateUser.isPending}
              >
                {updateUser.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalConfirmText}>Save</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const queryClient = useQueryClient();
  const { user, logout, canEditConfig, canManageUsers } = useAuth();
  const { show: showToast, ToastBanner } = useToast();

  const { data: config, isLoading: configLoading } = useGetAlertConfig({ query: { enabled: canEditConfig } });
  const { data: sites } = useListSites();
  const { data: magentoConfig } = useGetMagentoConfig({ query: { enabled: canEditConfig } });
  const updateConfig = useUpdateAlertConfig();
  const updateSite = useUpdateSite();
  const testSmtp = useTestSmtpConnection();
  const sendTestEmailMutation = useSendTestEmail();
  const testSlack = useTestSlackConnection();
  const testWhatsApp = useTestWhatsAppConnection();
  const updateMagentoConfig = useUpdateMagentoConfig();
  const testMagento = useTestMagentoConnection();

  const [recipientEmails, setRecipientEmails] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [isEnabled, setIsEnabled] = useState(true);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUsername, setSmtpUsername] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [thresholds, setThresholds] = useState<Record<number, string>>({});

  const [slackEnabled, setSlackEnabled] = useState(false);
  const [slackWebhookUrl, setSlackWebhookUrl] = useState("");
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

  const [hasChanges, setHasChanges] = useState(false);
  const [hasMagChanges, setHasMagChanges] = useState(false);

  useEffect(() => {
    if (config) {
      setRecipientEmails(config.recipientEmails);
      setSenderEmail(config.senderEmail);
      setIsEnabled(config.isEnabled);
      setSmtpHost(config.smtpHost);
      setSmtpPort(String(config.smtpPort));
      setSmtpUsername(config.smtpUsername);
      setSmtpPassword(config.smtpPassword);
      setSmtpSecure(config.smtpSecure);
      setSlackEnabled(config.slackEnabled);
      setSlackWebhookUrl(config.slackWebhookUrl);
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
      sites.forEach((s) => { t[s.id] = String(s.slowThresholdMs); });
      setThresholds(t);
    }
  }, [sites?.length]);

  const markChanged = () => setHasChanges(true);
  const markMagChanged = () => setHasMagChanges(true);

  const handleSave = async () => {
    try {
      await updateConfig.mutateAsync({
        data: {
          recipientEmails, senderEmail, isEnabled,
          smtpHost, smtpPort: Number(smtpPort) || 587, smtpUsername, smtpPassword, smtpSecure,
          slackEnabled, slackWebhookUrl, slackChannel,
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
      setHasChanges(false);
      showToast("Settings saved successfully.", "success");
    } catch {
      showToast("Failed to save settings. Please try again.", "error");
    }
  };

  const handleSaveMagento = async () => {
    try {
      await updateMagentoConfig.mutateAsync({
        data: { apiUrl: magApiUrl, adminUser: magAdminUser, adminPass: magAdminPass, apiToken: magApiToken, isEnabled: magEnabled },
      });
      queryClient.invalidateQueries({ queryKey: ["/api/config/magento"] });
      setHasMagChanges(false);
      showToast("Magento settings saved.", "success");
    } catch {
      showToast("Failed to save Magento settings.", "error");
    }
  };

  const handleTestSmtp = async () => {
    try {
      const result = await testSmtp.mutateAsync({
        data: { smtpHost, smtpPort: Number(smtpPort) || 587, smtpUsername, smtpPassword, smtpSecure },
      });
      if (result.success) {
        showToast("SMTP connection successful! Mail server is reachable.", "success");
      } else {
        showToast(`SMTP connection failed: ${result.error}`, "error");
      }
    } catch {
      showToast("Could not test SMTP connection.", "error");
    }
  };

  const handleSendTestEmail = async () => {
    try {
      const result = await sendTestEmailMutation.mutateAsync({
        data: { smtpHost, smtpPort: Number(smtpPort) || 587, smtpUsername, smtpPassword, smtpSecure, senderEmail, recipientEmails },
      });
      if (result.success) {
        showToast("Test email sent! Check your inbox.", "success");
      } else {
        showToast(`Email delivery failed: ${result.error}`, "error");
      }
    } catch {
      showToast("Could not send test email.", "error");
    }
  };

  const handleTestSlack = async () => {
    try {
      const result = await testSlack.mutateAsync({ data: { slackWebhookUrl } });
      if (result.success) {
        showToast("Slack test message sent! Check your channel.", "success");
      } else {
        showToast(`Slack test failed: ${result.error}`, "error");
      }
    } catch {
      showToast("Could not test Slack webhook.", "error");
    }
  };

  const handleTestWhatsApp = async () => {
    const recipients = whatsappRecipients.split(",").map((r) => r.trim()).filter(Boolean);
    if (recipients.length === 0) {
      showToast("Add at least one recipient phone number first.", "error");
      return;
    }
    try {
      const result = await testWhatsApp.mutateAsync({
        data: { whatsappApiToken, whatsappPhoneNumberId, testRecipient: recipients[0] },
      });
      if (result.success) {
        showToast("WhatsApp test message sent!", "success");
      } else {
        showToast(`WhatsApp test failed: ${result.error}`, "error");
      }
    } catch {
      showToast("Could not test WhatsApp connection.", "error");
    }
  };

  const handleTestMagento = async () => {
    try {
      const result = await testMagento.mutateAsync({
        data: { apiUrl: magApiUrl, adminUser: magAdminUser, adminPass: magAdminPass, apiToken: magApiToken },
      });
      if (result.success) {
        showToast(`Magento connected! Stores: ${result.stores}`, "success");
      } else {
        showToast(`Magento connection failed: ${result.error}`, "error");
      }
    } catch {
      showToast("Could not test Magento connection.", "error");
    }
  };

  if (configLoading) {
    return (
      <View style={[styles.root, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {ToastBanner}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: (isWeb ? 67 : insets.top) + 16, paddingBottom: (isWeb ? 34 : insets.bottom) + 100 },
        ]}
      >
        <Text style={styles.title}>Settings</Text>

        <TeamSection showToast={showToast} />

        {canEditConfig && (
          <>
            {/* ── Magento Connection ── */}
            <View style={styles.section}>
              <SectionHeader icon="shopping-bag" title="Magento Connection" description="Connect to your Magento store for order and cart tracking" />

              <View style={styles.toggleRow}>
                <View style={styles.toggleInfo}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={styles.toggleLabel}>Enable Magento Sync</Text>
                    <StatusDot connected={magentoConfig?.lastTestStatus === "success"} />
                  </View>
                  <Text style={styles.toggleDescription}>
                    {magentoConfig?.lastTestStatus === "success" ? "Connected and syncing" : "Configure credentials below"}
                  </Text>
                </View>
                <Switch
                  value={magEnabled}
                  onValueChange={(v) => { setMagEnabled(v); markMagChanged(); }}
                  trackColor={{ false: "#D1D5DB", true: `${Colors.light.tint}80` }}
                  thumbColor={magEnabled ? Colors.light.tint : "#F3F4F6"}
                />
              </View>

              <Field label="Magento Store URL">
                <TextInput
                  style={styles.textInput}
                  value={magApiUrl}
                  onChangeText={(v) => { setMagApiUrl(v); markMagChanged(); }}
                  placeholder="https://www.lovefurniture.ie"
                  placeholderTextColor={Colors.light.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </Field>

              <Field label="Admin Username">
                <TextInput
                  style={styles.textInput}
                  value={magAdminUser}
                  onChangeText={(v) => { setMagAdminUser(v); markMagChanged(); }}
                  placeholder="admin"
                  placeholderTextColor={Colors.light.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </Field>

              <PasswordField
                label="Admin Password"
                value={magAdminPass}
                onChangeText={(v) => { setMagAdminPass(v); markMagChanged(); }}
                placeholder="Magento admin password"
              />

              <PasswordField
                label="Static API Token (optional fallback)"
                value={magApiToken}
                onChangeText={(v) => { setMagApiToken(v); markMagChanged(); }}
                placeholder="Magento integration token"
              />

              <View style={styles.buttonRow}>
                <TestButton label="Test Connection" onPress={handleTestMagento} isPending={testMagento.isPending} disabled={!magApiUrl} />
                {hasMagChanges && (
                  <Pressable
                    style={({ pressed }) => [styles.saveButtonSmall, pressed && styles.saveButtonPressed]}
                    onPress={handleSaveMagento}
                    disabled={updateMagentoConfig.isPending}
                  >
                    {updateMagentoConfig.isPending ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Feather name="check" size={14} color="#FFFFFF" />
                        <Text style={styles.saveButtonSmallText}>Save</Text>
                      </>
                    )}
                  </Pressable>
                )}
              </View>
            </View>

            {/* ── Email Notifications ── */}
            <View style={styles.section}>
              <SectionHeader icon="mail" title="Email Notifications" />

              <View style={styles.toggleRow}>
                <View style={styles.toggleInfo}>
                  <Text style={styles.toggleLabel}>Enable Email Alerts</Text>
                  <Text style={styles.toggleDescription}>Send email alerts when issues are detected</Text>
                </View>
                <Switch
                  value={isEnabled}
                  onValueChange={(v) => { setIsEnabled(v); markChanged(); }}
                  trackColor={{ false: "#D1D5DB", true: `${Colors.light.tint}80` }}
                  thumbColor={isEnabled ? Colors.light.tint : "#F3F4F6"}
                />
              </View>

              <Field label="Sender Email (From address)">
                <TextInput
                  style={styles.textInput}
                  value={senderEmail}
                  onChangeText={(v) => { setSenderEmail(v); markChanged(); }}
                  placeholder="alerts@yourdomain.com"
                  placeholderTextColor={Colors.light.textSecondary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </Field>

              <Field label="Recipient Emails (comma separated)">
                <TextInput
                  style={[styles.textInput, styles.textInputMultiline]}
                  value={recipientEmails}
                  onChangeText={(v) => { setRecipientEmails(v); markChanged(); }}
                  placeholder="team@company.com, dev@company.com"
                  placeholderTextColor={Colors.light.textSecondary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  multiline
                />
              </Field>
            </View>

            {/* ── SMTP Server ── */}
            <View style={styles.section}>
              <SectionHeader icon="server" title="SMTP Server" description="Configure your outgoing mail server" />

              <Field label="SMTP Host">
                <TextInput
                  style={styles.textInput}
                  value={smtpHost}
                  onChangeText={(v) => { setSmtpHost(v); markChanged(); }}
                  placeholder="smtp.gmail.com"
                  placeholderTextColor={Colors.light.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </Field>

              <View style={styles.row}>
                <View style={[styles.fieldGroup, { flex: 1, marginRight: 12 }]}>
                  <Text style={styles.fieldLabel}>Port</Text>
                  <TextInput
                    style={styles.textInput}
                    value={smtpPort}
                    onChangeText={(v) => { setSmtpPort(v); markChanged(); }}
                    placeholder="587"
                    placeholderTextColor={Colors.light.textSecondary}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>SSL/TLS</Text>
                  <View style={styles.toggleRowSmall}>
                    <Text style={styles.toggleLabelSmall}>{smtpSecure ? "Enabled" : "Disabled"}</Text>
                    <Switch
                      value={smtpSecure}
                      onValueChange={(v) => { setSmtpSecure(v); markChanged(); }}
                      trackColor={{ false: "#D1D5DB", true: `${Colors.light.tint}80` }}
                      thumbColor={smtpSecure ? Colors.light.tint : "#F3F4F6"}
                    />
                  </View>
                </View>
              </View>

              <Field label="Username">
                <TextInput
                  style={styles.textInput}
                  value={smtpUsername}
                  onChangeText={(v) => { setSmtpUsername(v); markChanged(); }}
                  placeholder="your-email@gmail.com"
                  placeholderTextColor={Colors.light.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </Field>

              <PasswordField
                label="Password"
                value={smtpPassword}
                onChangeText={(v) => { setSmtpPassword(v); markChanged(); }}
                placeholder="App password or SMTP password"
              />

              <View style={styles.buttonRow}>
                <TestButton label="Test Connection" onPress={handleTestSmtp} isPending={testSmtp.isPending} disabled={!smtpHost} />
                <TestButton label="Send Test Email" onPress={handleSendTestEmail} isPending={sendTestEmailMutation.isPending} disabled={!smtpHost || !senderEmail || !recipientEmails} icon="send" />
              </View>
            </View>

            {/* ── Slack Notifications ── */}
            <View style={styles.section}>
              <SectionHeader icon="message-square" title="Slack Notifications" description="Get alerts in your Slack channel via incoming webhook" />

              <View style={styles.toggleRow}>
                <View style={styles.toggleInfo}>
                  <Text style={styles.toggleLabel}>Enable Slack Alerts</Text>
                  <Text style={styles.toggleDescription}>Send alerts to a Slack channel</Text>
                </View>
                <Switch
                  value={slackEnabled}
                  onValueChange={(v) => { setSlackEnabled(v); markChanged(); }}
                  trackColor={{ false: "#D1D5DB", true: `${Colors.light.tint}80` }}
                  thumbColor={slackEnabled ? Colors.light.tint : "#F3F4F6"}
                />
              </View>

              <Field label="Webhook URL">
                <TextInput
                  style={styles.textInput}
                  value={slackWebhookUrl}
                  onChangeText={(v) => { setSlackWebhookUrl(v); markChanged(); }}
                  placeholder="https://hooks.slack.com/services/T.../B.../xxx"
                  placeholderTextColor={Colors.light.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </Field>

              <Field label="Channel (optional override)">
                <TextInput
                  style={styles.textInput}
                  value={slackChannel}
                  onChangeText={(v) => { setSlackChannel(v); markChanged(); }}
                  placeholder="#monitoring-alerts"
                  placeholderTextColor={Colors.light.textSecondary}
                  autoCapitalize="none"
                />
              </Field>

              <TestButton label="Send Test Message" onPress={handleTestSlack} isPending={testSlack.isPending} disabled={!slackWebhookUrl} icon="send" />

              <View style={styles.helpBox}>
                <Feather name="info" size={14} color={Colors.light.textSecondary} />
                <Text style={styles.helpText}>
                  Create an Incoming Webhook in your Slack workspace: Apps {">"} Incoming Webhooks {">"} Add New Webhook
                </Text>
              </View>
            </View>

            {/* ── WhatsApp Notifications ── */}
            <View style={styles.section}>
              <SectionHeader icon="phone" title="WhatsApp Notifications" description="Send alerts via WhatsApp Business Cloud API" />

              <View style={styles.toggleRow}>
                <View style={styles.toggleInfo}>
                  <Text style={styles.toggleLabel}>Enable WhatsApp Alerts</Text>
                  <Text style={styles.toggleDescription}>Send alerts to WhatsApp numbers</Text>
                </View>
                <Switch
                  value={whatsappEnabled}
                  onValueChange={(v) => { setWhatsappEnabled(v); markChanged(); }}
                  trackColor={{ false: "#D1D5DB", true: `${Colors.light.tint}80` }}
                  thumbColor={whatsappEnabled ? Colors.light.tint : "#F3F4F6"}
                />
              </View>

              <PasswordField
                label="API Access Token"
                value={whatsappApiToken}
                onChangeText={(v) => { setWhatsappApiToken(v); markChanged(); }}
                placeholder="Meta Business API token"
              />

              <Field label="Phone Number ID">
                <TextInput
                  style={styles.textInput}
                  value={whatsappPhoneNumberId}
                  onChangeText={(v) => { setWhatsappPhoneNumberId(v); markChanged(); }}
                  placeholder="1234567890"
                  placeholderTextColor={Colors.light.textSecondary}
                  autoCapitalize="none"
                />
              </Field>

              <Field label="Recipient Numbers (comma separated, with country code)">
                <TextInput
                  style={[styles.textInput, styles.textInputMultiline]}
                  value={whatsappRecipients}
                  onChangeText={(v) => { setWhatsappRecipients(v); markChanged(); }}
                  placeholder="+353851234567, +447901234567"
                  placeholderTextColor={Colors.light.textSecondary}
                  keyboardType="phone-pad"
                  multiline
                />
              </Field>

              <TestButton label="Send Test Message" onPress={handleTestWhatsApp} isPending={testWhatsApp.isPending} disabled={!whatsappApiToken || !whatsappPhoneNumberId || !whatsappRecipients} icon="send" />

              <View style={styles.helpBox}>
                <Feather name="info" size={14} color={Colors.light.textSecondary} />
                <Text style={styles.helpText}>
                  Requires a Meta Business account with WhatsApp Business API. Get your Phone Number ID and Access Token from developers.facebook.com
                </Text>
              </View>
            </View>

            {/* ── Performance Thresholds ── */}
            <View style={styles.section}>
              <SectionHeader icon="activity" title="Performance Thresholds" description="Response time (ms) above which a site is considered slow" />

              {sites?.map((site) => (
                <View key={site.id} style={styles.thresholdRow}>
                  <View style={styles.thresholdInfo}>
                    <Text style={styles.thresholdName}>{site.name}</Text>
                    <Text style={styles.thresholdUrl}>{site.url}</Text>
                  </View>
                  <View style={styles.thresholdInputContainer}>
                    <TextInput
                      style={styles.thresholdInput}
                      value={thresholds[site.id] ?? ""}
                      onChangeText={(v) => {
                        setThresholds((prev) => ({ ...prev, [site.id]: v }));
                        markChanged();
                      }}
                      keyboardType="number-pad"
                    />
                    <Text style={styles.thresholdUnit}>ms</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* ── Save Button ── */}
            {hasChanges && (
              <Pressable
                style={({ pressed }) => [styles.saveButton, pressed && styles.saveButtonPressed]}
                onPress={handleSave}
                disabled={updateConfig.isPending}
              >
                {updateConfig.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Feather name="check" size={18} color="#FFFFFF" />
                    <Text style={styles.saveButtonText}>Save Changes</Text>
                  </>
                )}
              </Pressable>
            )}
          </>
        )}

        {/* ── Account ── */}
        <View style={styles.section}>
          <SectionHeader icon="user" title="Account" />
          <View style={styles.accountCard}>
            <Feather name="user" size={20} color={Colors.light.textSecondary} />
            <Text style={styles.accountUsername}>{user?.username}</Text>
            {user?.role && <RoleBadge role={user.role} />}
          </View>
          <Pressable
            style={({ pressed }) => [styles.logoutButton, pressed && styles.logoutButtonPressed]}
            onPress={() => {
              showAlert("Sign Out", "Are you sure you want to sign out?", [
                { text: "Cancel", style: "cancel" },
                { text: "Sign Out", style: "destructive", onPress: logout },
              ]);
            }}
          >
            <Feather name="log-out" size={18} color="#dc3545" />
            <Text style={styles.logoutButtonText}>Sign Out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.light.background },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20 },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", color: Colors.light.text, marginBottom: 20 },
  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  sectionTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  sectionDescription: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, marginBottom: 12 },
  toggleRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: Colors.light.surface, borderRadius: 12, padding: 16, marginTop: 12, marginBottom: 16,
  },
  toggleInfo: { flex: 1, marginRight: 12 },
  toggleLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  toggleDescription: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, marginTop: 2 },
  row: { flexDirection: "row", alignItems: "flex-start" },
  toggleRowSmall: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: Colors.light.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: Colors.light.border,
  },
  toggleLabelSmall: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.light.text },
  fieldGroup: { marginBottom: 14 },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary, marginBottom: 6 },
  textInput: {
    backgroundColor: Colors.light.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.light.text,
    borderWidth: 1, borderColor: Colors.light.border,
  },
  textInputMultiline: { minHeight: 60, textAlignVertical: "top" },
  passwordContainer: { position: "relative" },
  passwordInput: { paddingRight: 48 },
  eyeButton: { position: "absolute", right: 14, top: 0, bottom: 0, justifyContent: "center" },
  testButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: `${Colors.light.tint}10`, borderRadius: 10, paddingVertical: 12,
    gap: 8, borderWidth: 1, borderColor: `${Colors.light.tint}30`, marginTop: 4, flex: 1,
  },
  testButtonPressed: { opacity: 0.7 },
  testButtonText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.light.tint },
  buttonRow: { flexDirection: "row", gap: 8 },
  saveButtonSmall: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: Colors.light.tint, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16,
    gap: 6, marginTop: 4,
  },
  saveButtonSmallText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  helpBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "#F0F9FF", borderRadius: 10, padding: 12, marginTop: 12,
    borderWidth: 1, borderColor: "#BAE6FD",
  },
  helpText: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#0C4A6E", flex: 1, lineHeight: 18 },
  thresholdRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: Colors.light.surface, borderRadius: 12, padding: 14, marginBottom: 8,
  },
  thresholdInfo: { flex: 1, marginRight: 12 },
  thresholdName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  thresholdUrl: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, marginTop: 2 },
  thresholdInputContainer: { flexDirection: "row", alignItems: "center", gap: 4 },
  thresholdInput: {
    backgroundColor: Colors.light.background, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
    width: 80, fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.light.text,
    textAlign: "center", borderWidth: 1, borderColor: Colors.light.border,
  },
  thresholdUnit: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  saveButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: Colors.light.tint, borderRadius: 12, paddingVertical: 14, gap: 8, marginBottom: 20,
  },
  saveButtonPressed: { opacity: 0.85 },
  saveButtonText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },
  accountCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: Colors.light.surface, borderRadius: 12, padding: 16, marginTop: 8, marginBottom: 12,
  },
  accountUsername: { fontSize: 15, fontFamily: "Inter_500Medium", color: Colors.light.text, flex: 1 },
  logoutButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: "#fef2f2", borderRadius: 12, paddingVertical: 14, gap: 8,
    borderWidth: 1, borderColor: "#fecaca",
  },
  logoutButtonPressed: { opacity: 0.85 },
  logoutButtonText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#dc3545" },
  toastBanner: {
    position: "absolute", top: Platform.OS === "web" ? 20 : 60, left: 20, right: 20, zIndex: 100,
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 16, paddingVertical: 14, borderRadius: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
  },
  toastSuccess: { backgroundColor: "#ECFDF5", borderWidth: 1, borderColor: "#A7F3D0" },
  toastError: { backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA" },
  toastInfo: { backgroundColor: "#EFF6FF", borderWidth: 1, borderColor: "#BFDBFE" },
  toastText: { fontSize: 14, fontFamily: "Inter_500Medium", flex: 1 },
  toastTextSuccess: { color: "#065F46" },
  toastTextError: { color: "#991B1B" },
  toastTextInfo: { color: "#1E40AF" },
  addUserButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: `${Colors.light.tint}10`, borderRadius: 10, paddingVertical: 12,
    gap: 8, borderWidth: 1, borderColor: `${Colors.light.tint}30`, marginTop: 8, marginBottom: 12,
  },
  addUserButtonText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.light.tint },
  userCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: Colors.light.surface, borderRadius: 12, padding: 14, marginBottom: 8,
  },
  userInfo: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginRight: 8 },
  userNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  userName: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.light.text },
  youBadge: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary },
  userActions: { flexDirection: "row", gap: 8 },
  userActionBtn: {
    width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center",
    backgroundColor: Colors.light.background, borderWidth: 1, borderColor: Colors.light.border,
  },
  roleBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1,
  },
  roleBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", padding: 20,
  },
  modalContent: {
    backgroundColor: Colors.light.background, borderRadius: 16, padding: 24,
    width: "100%", maxWidth: 400,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8,
  },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.light.text, marginBottom: 16 },
  modalButtons: { flexDirection: "row", gap: 12, marginTop: 8 },
  modalCancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center",
    backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border,
  },
  modalCancelText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  modalConfirmBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center",
    backgroundColor: Colors.light.tint,
  },
  modalConfirmText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },
  roleSelector: { flexDirection: "row", gap: 8 },
  roleOption: {
    flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center",
    backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border,
  },
  roleOptionSelected: {
    backgroundColor: `${Colors.light.tint}15`, borderColor: Colors.light.tint,
  },
  roleOptionText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  roleOptionTextSelected: { color: Colors.light.tint, fontFamily: "Inter_600SemiBold" },
});
