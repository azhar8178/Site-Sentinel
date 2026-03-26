import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Colors from "@/constants/colors";

interface DataPoint {
  value: number;
  label?: string;
  isUp?: boolean;
}

interface SimpleChartProps {
  data: DataPoint[];
  height?: number;
  showLabels?: boolean;
}

export function SimpleChart({ data, height = 120, showLabels = false }: SimpleChartProps) {
  if (data.length === 0) {
    return (
      <View style={[styles.container, { height }]}>
        <Text style={styles.emptyText}>No data yet</Text>
      </View>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const barWidth = Math.max(2, Math.min(8, (300 - data.length) / data.length));

  return (
    <View style={styles.wrapper}>
      <View style={[styles.container, { height }]}>
        <View style={styles.bars}>
          {data.map((point, i) => {
            const barHeight = Math.max(2, (point.value / maxValue) * (height - 20));
            let color = Colors.light.success;
            if (!point.isUp) {
              color = Colors.light.danger;
            } else if (point.value > 5000) {
              color = Colors.light.warning;
            } else if (point.value > 3000) {
              color = Colors.light.tint;
            }

            return (
              <View key={i} style={styles.barContainer}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: barHeight,
                      width: barWidth,
                      backgroundColor: color,
                      borderRadius: barWidth / 2,
                    },
                  ]}
                />
              </View>
            );
          })}
        </View>
      </View>
      {showLabels && data.length > 0 && (
        <View style={styles.labels}>
          <Text style={styles.label}>{data[0].label}</Text>
          <Text style={styles.label}>{data[data.length - 1].label}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {},
  container: {
    justifyContent: "center",
    alignItems: "center",
  },
  bars: {
    flexDirection: "row",
    alignItems: "flex-end",
    flex: 1,
    gap: 1,
  },
  barContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    height: "100%",
  },
  bar: {
    minHeight: 2,
  },
  labels: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 4,
  },
  label: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
  },
});
