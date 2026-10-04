import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { RecordList, RowText, StatusRow } from "@/components/record-list";
import { colors } from "@/components/ui";
import { RequirePermission } from "@/features/access/guards";
import { allowed } from "@/features/access/workspace";
import { useAuth } from "@/features/auth/auth-provider";
import { queueActions, type QueueAction } from "@/features/queue/actions";
import { api } from "@/lib/api/client";
import { describeError } from "@/lib/api/errors";
import { isOnline } from "@/offline/connectivity/network";
import { requireOnlineMutation } from "@/offline/sync/policy";
import type { QueueEntry } from "@/lib/api/types";
import { shortId } from "@/lib/format";

export function QueueScreen() {
  return (
    <RequirePermission permission="appointments.view" title="Queue">
      <QueueList />
    </RequirePermission>
  );
}

function QueueList() {
  const { account } = useAuth();
  const canUpdate = Boolean(account && allowed(account.permissions, "appointments.update"));

  return (
    <RecordList<QueueEntry>
      title="Queue"
      resource="queue"
      path="/queue-entries/"
      emptyLabel="queue entries"
      renderItem={(row) => (
        <View style={styles.item}>
          <StatusRow value={row.status} />
          <RowText label="Position" value={String(row.position)} />
          <RowText label="Service date" value={row.service_date} />
          <RowText label="Appointment" value={row.appointment_status} />
          <RowText label="Patient" value={shortId(row.patient)} />
          <RowText label="Doctor" value={shortId(row.doctor)} />
          {canUpdate ? <QueueActions entryId={row.id} /> : null}
        </View>
      )}
    />
  );
}

function QueueActions({ entryId }: { entryId: string }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (action: QueueAction) => {
      requireOnlineMutation(`queue.${action}`, isOnline());
      return api<QueueEntry>(`/queue-entries/${entryId}/${action}/`, { method: "POST", body: "{}" });
    },
    onSuccess: async () => {
      setMessage(null);
      await queryClient.invalidateQueries({ queryKey: ["queue"] });
    },
    onError: (error) => {
      setMessage(describeError(error));
    },
  });

  return (
    <View style={styles.actions}>
      {queueActions.map((action) => (
        <Pressable
          key={action}
          accessibilityRole="button"
          disabled={mutation.isPending}
          style={styles.action}
          onPress={() => mutation.mutate(action)}
        >
          <Text style={styles.actionText}>{action}</Text>
        </Pressable>
      ))}
      {message ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    gap: 6,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  action: {
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  actionText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    width: "100%",
  },
});
