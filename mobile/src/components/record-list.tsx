import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { ErrorState, LoadingState } from "@/components/states";
import { colors, Notice, StatusLine } from "@/components/ui";
import { useAuth } from "@/features/auth/auth-provider";
import { ApiError } from "@/lib/api/errors";
import { withQuery } from "@/lib/api/client";
import { loadCachedPage } from "@/offline/repositories/read-repository";

export function RecordList<T extends { id: string }>({
  title,
  resource,
  path,
  extraParams,
  emptyLabel,
  renderItem,
  headerExtra,
}: {
  title: string;
  resource: string;
  path: string;
  extraParams?: Record<string, string | undefined>;
  emptyLabel: string;
  renderItem: (item: T) => React.ReactNode;
  headerExtra?: React.ReactNode;
}) {
  const { branchId, account } = useAuth();
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: [resource, search, extraParams, branchId, account?.id],
    queryFn: () =>
      loadCachedPage<T>({
        userId: account?.id ?? null,
        branchId,
        resource,
        path: withQuery(path, { search: search || undefined, ...extraParams }),
      }),
  });

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={query.data?.records ?? []}
      keyExtractor={(item) => item.id}
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          {headerExtra}
          <TextInput
            accessibilityLabel={`Search ${title}`}
            autoCapitalize="none"
            autoComplete="off"
            placeholder="Search"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => setSearch(draft.trim())}
            returnKeyType="search"
          />
          {query.data?.notice ? <Notice>{query.data.notice}</Notice> : null}
          {query.isLoading ? <LoadingState /> : null}
          {query.isError ? (
            query.error instanceof ApiError && query.error.status === 404 ? (
              <Notice>This resource is not available.</Notice>
            ) : (
              <ErrorState error={query.error} onRetry={() => void query.refetch()} />
            )
          ) : null}
          {query.data && query.data.records.length === 0 ? (
            <Notice>{search ? `No ${emptyLabel} match this search.` : `No ${emptyLabel} are recorded.`}</Notice>
          ) : null}
        </View>
      }
      renderItem={({ item }) => <View style={styles.card}>{renderItem(item)}</View>}
    />
  );
}

export function RowText({ label, value }: { label: string; value: string }) {
  return (
    <Text style={styles.row}>
      <Text style={styles.rowLabel}>{label}: </Text>
      {value || "—"}
    </Text>
  );
}

export function StatusRow({ value }: { value: string }) {
  return <StatusLine label={value} />;
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
    gap: 12,
  },
  header: {
    gap: 12,
    marginBottom: 12,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "700",
  },
  input: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
    marginBottom: 12,
    padding: 14,
  },
  row: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  rowLabel: {
    color: colors.muted,
  },
});
