import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

export const colors = {
  background: "#f4f7f8",
  card: "#ffffff",
  text: "#12343b",
  muted: "#4d646b",
  border: "#d5e0e4",
  primary: "#1f6f78",
  primaryText: "#ffffff",
  danger: "#9b2c2c",
};

export function Notice({ children }: { children: ReactNode }) {
  return <Text style={styles.notice}>{children}</Text>;
}

export function StatusLine({ label }: { label: string }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12,
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "#e7eef0",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    color: colors.text,
    fontSize: 13,
  },
});
