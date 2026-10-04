import { useQuery } from "@tanstack/react-query";
import { type Href, router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ErrorState, LoadingState } from "@/components/states";
import { colors, Notice } from "@/components/ui";
import { SyncStatus } from "@/components/sync-status";
import { allowed, destinationsFor, type Workspace } from "@/features/access/workspace";
import { useAuth } from "@/features/auth/auth-provider";
import { api, withQuery } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import type { Branch, Page } from "@/lib/api/types";

export function RoleHome({ workspace, title }: { workspace: Workspace; title: string }) {
  const { account, signOut } = useAuth();
  const items = destinationsFor(workspace).filter((item) => allowed(account?.permissions ?? [], item.permission));

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      <Notice>Signed in as {account?.full_name || account?.email}.</Notice>
      <SyncStatus />
      <BranchPicker />
      {items.length === 0 ? <Notice>This account has no further screens in this workspace.</Notice> : null}
      {items.map((item) => (
        <Pressable
          key={item.href}
          accessibilityRole="button"
          style={styles.link}
          onPress={() => router.push(item.href as Href)}
        >
          <Text style={styles.linkText}>{item.label}</Text>
        </Pressable>
      ))}
      <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => void signOut()}>
        <Text style={styles.secondaryText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

export function BranchPicker() {
  const { account, branchId, setBranchId } = useAuth();
  const enabled = Boolean(account?.permissions.includes("branches.view"));
  const query = useQuery({
    queryKey: ["branches", branchId],
    enabled,
    queryFn: () => api<Page<Branch>>(withQuery("/branches/", { page_size: "100" })),
  });

  if (!enabled) {
    return <Notice>Branch selection is unavailable for this account.</Notice>;
  }
  if (query.isLoading) {
    return <LoadingState />;
  }
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 0) {
      return <Notice>The branch list is not available offline. The selected branch stays on this device.</Notice>;
    }
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }

  return (
    <View style={styles.branchList}>
      <Text style={styles.branchLabel}>Branch</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: branchId === null }}
        style={[styles.branch, branchId === null && styles.branchSelected]}
        onPress={() => void setBranchId(null)}
      >
        <Text style={styles.branchText}>No branch selected</Text>
      </Pressable>
      {query.data?.results.map((branch) => (
        <Pressable
          key={branch.id}
          accessibilityRole="button"
          accessibilityState={{ selected: branchId === branch.id }}
          style={[styles.branch, branchId === branch.id && styles.branchSelected]}
          onPress={() => void setBranchId(branch.id)}
        >
          <Text style={styles.branchText}>
            {branch.name} ({branch.code})
          </Text>
        </Pressable>
      ))}
      {query.data && query.data.results.length === 0 ? <Notice>No branches are recorded.</Notice> : null}
    </View>
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
  link: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    minHeight: 52,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  linkText: {
    color: colors.primaryText,
    fontSize: 17,
    fontWeight: "600",
  },
  secondary: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 48,
    justifyContent: "center",
  },
  secondaryText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
  },
  branchList: {
    gap: 8,
  },
  branchLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  branch: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  branchSelected: {
    borderColor: colors.primary,
  },
  branchText: {
    color: colors.text,
    fontSize: 16,
  },
});
