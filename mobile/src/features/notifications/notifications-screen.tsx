import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ErrorState, LoadingState } from "@/components/states";
import { colors, Notice } from "@/components/ui";
import { RequirePermission } from "@/features/access/guards";
import { api } from "@/lib/api/client";
import { describeError } from "@/lib/api/errors";
import { formatWhen } from "@/lib/format";
import { isOnline } from "@/offline/connectivity/network";
import { requireOnlineMutation } from "@/offline/sync/policy";

type NotificationRow = {
  id: string;
  title: string;
  message: string;
  kind: string;
  read_at: string | null;
  created_at: string;
};

type ListResponse = { results: NotificationRow[] };

export function NotificationsScreen() {
  return (
    <RequirePermission permission="notifications.view" title="Notifications">
      <NotificationsInbox />
    </RequirePermission>
  );
}

function NotificationsInbox() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<ListResponse>("/notifications/"),
  });
  const markRead = useMutation({
    mutationFn: (id: string) => {
      requireOnlineMutation("notifications.read", isOnline());
      return api(`/notifications/${id}/`, {
        method: "PATCH",
        body: JSON.stringify({ read: true }),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  if (query.isLoading) {
    return <LoadingState />;
  }
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} detail={describeError(query.error)} />;
  }

  const rows = query.data?.results ?? [];
  if (rows.length === 0) {
    return <Notice>No notifications yet.</Notice>;
  }

  return (
    <View style={styles.list}>
      {rows.map((row) => (
        <View key={row.id} style={[styles.card, !row.read_at && styles.unread]}>
          <Text style={styles.title}>{row.title}</Text>
          {row.message ? <Text style={styles.message}>{row.message}</Text> : null}
          <Text style={styles.meta}>{formatWhen(row.created_at)}</Text>
          {!row.read_at ? (
            <Pressable accessibilityRole="button" style={styles.button} onPress={() => markRead.mutate(row.id)}>
              <Text style={styles.buttonText}>Mark read</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    backgroundColor: colors.surface,
  },
  unread: { backgroundColor: colors.accent },
  title: { fontSize: 16, fontWeight: "600", color: colors.text },
  message: { marginTop: 4, color: colors.muted },
  meta: { marginTop: 8, fontSize: 12, color: colors.muted },
  button: {
    marginTop: 8,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  buttonText: { color: colors.text, fontWeight: "500" },
});
