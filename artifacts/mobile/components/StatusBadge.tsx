import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import Colors from "@/constants/colors";

type Status = "up" | "down" | "slow" | "unknown";

interface StatusBadgeProps {
  status: Status;
  size?: "small" | "large";
}

const statusConfig: Record<Status, { label: string; color: string; bg: string; icon: keyof typeof Feather.glyphMap }> = {
  up: { label: "Online", color: Colors.light.success, bg: Colors.light.successBg, icon: "check-circle" },
  down: { label: "Offline", color: Colors.light.danger, bg: Colors.light.dangerBg, icon: "x-circle" },
  slow: { label: "Slow", color: Colors.light.warning, bg: Colors.light.warningBg, icon: "alert-triangle" },
  unknown: { label: "Unknown", color: Colors.light.textSecondary, bg: "#F3F4F6", icon: "help-circle" },
};

export function StatusBadge({ status, size = "small" }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.unknown;
  const isLarge = size === "large";

  return (
    <View style={[styles.badge, { backgroundColor: config.bg }, isLarge && styles.badgeLarge]}>
      <Feather name={config.icon} size={isLarge ? 16 : 12} color={config.color} />
      <Text style={[styles.text, { color: config.color }, isLarge && styles.textLarge]}>
        {config.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  badgeLarge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  text: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  textLarge: {
    fontSize: 14,
  },
});
