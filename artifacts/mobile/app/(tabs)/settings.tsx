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
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import Colors from "@/constants/colors";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const queryClient = useQueryClient();

  const { data: config, isLoading: configLoading } = useGetAlertConfig();
  const { data: sites } = useListSites();
  const updateConfig = useUpdateAlertConfig();
  const updateSite = useUpdateSite();

  const [recipientEmails, setRecipientEmails] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [isEnabled, setIsEnabled] = useState(true);
  const [thresholds, setThresholds] = useState<Record<number, string>>({});
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (config) {
      setRecipientEmails(config.recipientEmails);
      setSenderEmail(config.senderEmail);
      setIsEnabled(config.isEnabled);
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
        data: { recipientEmails, senderEmail, isEnabled },
      });

      for (const site of sites ?? []) {
        const threshold = Number(thresholds[site.id]);
        if (!isNaN(threshold) && threshold !== site.slowThresholdMs) {
          await updateSite.mutateAsync({
            siteId: site.id.toString(),
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
              onValueChange={(v) => {
                setIsEnabled(v);
                setHasChanges(true);
              }}
              trackColor={{ false: "#D1D5DB", true: `${Colors.light.tint}80` }}
              thumbColor={isEnabled ? Colors.light.tint : "#F3F4F6"}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Sender Email (SES verified)</Text>
            <TextInput
              style={styles.textInput}
              value={senderEmail}
              onChangeText={(v) => {
                setSenderEmail(v);
                setHasChanges(true);
              }}
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
              onChangeText={(v) => {
                setRecipientEmails(v);
                setHasChanges(true);
              }}
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
                    setHasChanges(true);
                  }}
                  keyboardType="number-pad"
                  testID={`threshold-${site.id}`}
                />
                <Text style={styles.thresholdUnit}>ms</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AWS SES Configuration</Text>
          <View style={styles.infoCard}>
            <Feather name="info" size={16} color={Colors.light.tint} />
            <Text style={styles.infoText}>
              AWS credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SES_REGION) should be
              set as environment secrets on the server.
            </Text>
          </View>
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
  sectionTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    marginBottom: 4,
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
  infoCard: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: `${Colors.light.tint}08`,
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
    borderWidth: 1,
    borderColor: `${Colors.light.tint}20`,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    lineHeight: 18,
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
});
