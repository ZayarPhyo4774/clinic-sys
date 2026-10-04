import { Pressable, ScrollView, StyleSheet, Text } from "react-native";

import { colors, Notice } from "@/components/ui";
import { BranchPicker } from "@/features/home/role-home";
import { useAuth } from "@/features/auth/auth-provider";

export function ProfileScreen() {
  const { account, signOut } = useAuth();

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={styles.title}>
        Profile
      </Text>
      <Notice>Name: {account?.full_name || "—"}</Notice>
      <Notice>Email: {account?.email || "—"}</Notice>
      <Notice>Clinic: {account?.clinic_id || "—"}</Notice>
      <BranchPicker />
      <Pressable accessibilityRole="button" style={styles.signOut} onPress={() => void signOut()}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    backgroundColor: colors.background,
    gap: 12,
    padding: 16,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "700",
  },
  signOut: {
    minHeight: 48,
    justifyContent: "center",
  },
  signOutText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: "600",
  },
});
