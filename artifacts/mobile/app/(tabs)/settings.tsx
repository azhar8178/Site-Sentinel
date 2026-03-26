import React, { useState, useEffect } from "react";
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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import {
  useGetAlertConfig,
  useUpdateAlertConfig,
  useListSites,
  useUpdateSite,
  useTestSmtpConnection,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const queryClient = useQueryClient();
  const { user, logout } = useAuth();

  const { data: config, isLoading: configLoading } = useGetAlertConfig();
  const { data: sites } = useListSites();
  const updateConfig = useUpdateAlertConfig();
  const updateSite = useUpdateSite();
  const testSmtp = useTestSmtpConnection();

  const [recipientEmails, setRecipientEmails] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [isEnabled, setIsEnabled] = useState(true);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUsername, setSmtpUsername] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [thresholds, setThresholds] = useState<Record<number, string>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
    }
  }, [config?.id]);

  useEffect(() => {
    if (sites) {
      const t: Record<number, string> = {};
      sites.forEach((s) => {
        t[s.id] = String(s.slowThresholdMs);
      });
      setThresholds(t);
    }
  }, [sites?.length]);

  const handleSave = async () => {
    try {
      await updateConfig.mutateAsync({
        data: {
          recipientEmails,
          senderEmail,
          isEnabled,
          smtpHost,
          smtpPort: Number(smtpPort) || 587,
          smtpUsername,
          smtpPassword,
          smtpSecure,
        },
      });

      for (const site of sites ?? []) {
        const threshold = Number(thresholds[site.id]);
        if (!isNaN(threshold) && threshold !== site.slowThresholdMs) {
          await updateSite.mutateAsync({
            siteId: site.id,
            data: { slowThresholdMs: threshold },
          });
        }
      }

      queryClient.invalidateQueries({ queryKey: ["/api/config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
      setHasChanges(false);
      Alert.alert("Saved", "Settings updated successfully.");
    } catch {
      Alert.alert("Error", "Failed to save settings. Please try again.");
    }
  };

  const handleTestSmtp = async () => {
    try {
      const result = await testSmtp.mutateAsync({
        data: {
          smtpHost,
          smtpPort: Number(smtpPort) || 587,
          smtpUsername,
          smtpPassword,
          smtpSecure,
        },
      });

      if (result.success) {
        Alert.alert("Success", "SMTP connection test passed! Your mail server is reachable.");
      } else {
        Alert.alert("Failed", `SMTP connection failed: ${result.error}`);
      }
    } catch {
      Alert.alert("Error", "Could not test SMTP connection. Please check your settings.");
    }
  };

  const markChanged = () => setHasChanges(true);

  if (configLoading) {
    return (
      <View style={[styles.root, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: (isWeb ? 67 : insets.top) + 16, paddingBottom: (isWeb ? 34 : insets.bottom) + 100 },
        ]}
      >
        <Text style={styles.title}>Settings</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Email Notifications</Text>

          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>Enable Alerts</Text>
              <Text style={styles.toggleDescription}>Send email alerts when issues are detected</Text>
            </View>
            <Switch
              value={isEnabled}
              onValueChange={(v) => { setIsEnabled(v); markChanged(); }}
              trackColor={{ false: "#D1D5DB", true: `${Colors.light.tint}80` }}
              thumbColor={isEnabled ? Colors.light.tint : "#F3F4F6"}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Sender Email (From address)</Text>
            <TextInput
              style={styles.textInput}
              value={senderEmail}
              onChangeText={(v) => { setSenderEmail(v); markChanged(); }}
              placeholder="alerts@yourdomain.com"
              placeholderTextColor={Colors.light.textSecondary}
              keyboardType="email-address"
              autoCapitalize="none"
              testID="sender-email-input"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Recipient Emails (comma separated)</Text>
            <TextInput
              style={[styles.textInput, styles.textInputMultiline]}
              value={recipientEmails}
              onChangeText={(v) => { setRecipientEmails(v); markChanged(); }}
              placeholder="team@company.com, dev@company.com"
              placeholderTextColor={Colors.light.textSecondary}
              keyboardType="email-address"
              autoCapitalize="none"
              multiline
              testID="recipient-emails-input"
            />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Feather name="server" size={18} color={Colors.light.text} />
            <Text style={styles.sectionTitle}>SMTP Server</Text>
          </View>
          <Text style={styles.sectionDescription}>
            Configure your outgoing mail server for sending alerts
          </Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>SMTP Host</Text>
            <TextInput
              style={styles.textInput}
              value={smtpHost}
              onChangeText={(v) => { setSmtpHost(v); markChanged(); }}
              placeholder="smtp.gmail.com"
              placeholderTextColor={Colors.light.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              testID="smtp-host-input"
            />
          </View>

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
                testID="smtp-port-input"
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

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Username</Text>
            <TextInput
              style={styles.textInput}
              value={smtpUsername}
              onChangeText={(v) => { setSmtpUsername(v); markChanged(); }}
              placeholder="your-email@gmail.com"
              placeholderTextColor={Colors.light.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              testID="smtp-username-input"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Password</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                style={[styles.textInput, styles.passwordInput]}
                value={smtpPassword}
                onChangeText={(v) => { setSmtpPassword(v); markChanged(); }}
                placeholder="App password or SMTP password"
                placeholderTextColor={Colors.light.textSecondary}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                testID="smtp-password-input"
              />
              <Pressable
                style={styles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Feather name={showPassword ? "eye-off" : "eye"} size={18} color={Colors.light.textSecondary} />
              </Pressable>
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [styles.testButton, pressed && styles.testButtonPressed]}
            onPress={handleTestSmtp}
            disabled={testSmtp.isPending || !smtpHost}
          >
            {testSmtp.isPending ? (
              <ActivityIndicator size="small" color={Colors.light.tint} />
            ) : (
              <>
                <Feather name="zap" size={16} color={Colors.light.tint} />
                <Text style={styles.testButtonText}>Test Connection</Text>
              </>
            )}
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Performance Thresholds</Text>
          <Text style={styles.sectionDescription}>
            Set the response time threshold (in ms) above which a site is considered slow
          </Text>

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
                  testID={`threshold-${site.id}`}
                />
                <Text style={styles.thresholdUnit}>ms</Text>
              </View>
            </View>
          ))}
        </View>

        {hasChanges && (
          <Pressable
            style={({ pressed }) => [styles.saveButton, pressed && styles.saveButtonPressed]}
            onPress={handleSave}
            disabled={updateConfig.isPending}
            testID="save-settings"
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

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.accountCard}>
            <Feather name="user" size={20} color={Colors.light.textSecondary} />
            <Text style={styles.accountUsername}>{user?.username}</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.logoutButton, pressed && styles.logoutButtonPressed]}
            onPress={() => {
              Alert.alert("Sign Out", "Are you sure you want to sign out?", [
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
  root: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
    marginBottom: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
  },
  sectionDescription: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    marginBottom: 12,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    marginBottom: 16,
  },
  toggleInfo: {
    flex: 1,
    marginRight: 12,
  },
  toggleLabel: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
  },
  toggleDescription: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  toggleRowSmall: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.light.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  toggleLabelSmall: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.light.text,
  },
  fieldGroup: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textSecondary,
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: Colors.light.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.light.text,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  textInputMultiline: {
    minHeight: 60,
    textAlignVertical: "top",
  },
  passwordContainer: {
    position: "relative",
  },
  passwordInput: {
    paddingRight: 48,
  },
  eyeButton: {
    position: "absolute",
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  testButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: `${Colors.light.tint}10`,
    borderRadius: 10,
    paddingVertical: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: `${Colors.light.tint}30`,
    marginTop: 4,
  },
  testButtonPressed: {
    opacity: 0.7,
  },
  testButtonText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.tint,
  },
  thresholdRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  thresholdInfo: {
    flex: 1,
    marginRight: 12,
  },
  thresholdName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
  },
  thresholdUrl: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  thresholdInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  thresholdInput: {
    backgroundColor: Colors.light.background,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    width: 80,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    textAlign: "center",
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  thresholdUnit: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textSecondary,
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.light.tint,
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
    marginBottom: 20,
  },
  saveButtonPressed: {
    opacity: 0.85,
  },
  saveButtonText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },
  accountCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    marginBottom: 12,
  },
  accountUsername: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: Colors.light.text,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fef2f2",
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  logoutButtonPressed: {
    opacity: 0.85,
  },
  logoutButtonText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#dc3545",
  },
});
