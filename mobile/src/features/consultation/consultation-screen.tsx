import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { RecordList, RowText, StatusRow } from "@/components/record-list";
import { Field } from "@/components/states";
import { SyncStatus } from "@/components/sync-status";
import { colors, Notice } from "@/components/ui";
import { RequirePermission } from "@/features/access/guards";
import { allowed } from "@/features/access/workspace";
import { useAuth } from "@/features/auth/auth-provider";
import type { Encounter } from "@/lib/api/types";
import { describeError } from "@/lib/api/errors";
import { formatWhen, shortId } from "@/lib/format";
import { listLocalRecords, queueConsultationNote } from "@/offline/repositories/clinical-repository";
import { getOperation } from "@/offline/outbox/outbox-repository";
import { runSync } from "@/offline/sync/worker";

export function ConsultationScreen() {
  return (
    <RequirePermission permission="encounters.view" title="Consultation">
      <RecordList<Encounter>
        title="Consultation"
        resource="encounters"
        path="/encounters/"
        emptyLabel="consultations"
        headerExtra={<ConsultationNoteForm />}
        renderItem={(row) => (
          <>
            <StatusRow value={row.status} />
            <RowText label="Started" value={formatWhen(row.started_at)} />
            <RowText label="Patient" value={shortId(row.patient)} />
            <RowText label="Doctor" value={shortId(row.doctor)} />
          </>
        )}
      />
    </RequirePermission>
  );
}

function ConsultationNoteForm() {
  const { account, branchId } = useAuth();
  const queryClient = useQueryClient();
  const [encounterId, setEncounterId] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<unknown>(null);
  const canCreate = Boolean(account && allowed(account.permissions, "encounters.create"));
  const notes = useQuery({
    queryKey: ["local-records", "consultation_note", account?.id],
    enabled: Boolean(account?.id),
    queryFn: () => listLocalRecords(account?.id ?? "", "consultation_note"),
  });
  const mutation = useMutation({
    mutationFn: async () => {
      if (!account?.id) {
        throw new Error("Sign in is required.");
      }
      const text = body.trim();
      if (!encounterId.trim() || !text) {
        throw new Error("Choose an encounter and enter the note.");
      }
      const operation = queueConsultationNote({
        userId: account.id,
        branchId,
        encounterId: encounterId.trim(),
        body: text,
      });
      await runSync(account.id);
      const current = getOperation(operation.operationId) ?? operation;
      if (current.status === "conflict" || current.status === "failed") {
        throw new Error(current.error || "The note was not recorded.");
      }
      return current;
    },
    onSuccess: async () => {
      setBody("");
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["local-records", "consultation_note"] });
    },
    onError: (caught) => setError(caught),
  });

  return (
    <>
      <SyncStatus />
      <Notice>A consultation note is added as a new record. This device does not replace an existing note.</Notice>
      {notes.data?.map((row) => {
        const payload = row.payload as { body?: string };
        return (
          <Notice key={row.localId}>
            {`${row.syncStatus} · ${shortId(row.parentId)} · ${payload.body || ""}${row.error ? ` · ${row.error}` : ""}`}
          </Notice>
        );
      })}
      {canCreate ? (
        <>
          <Field label="Encounter" value={encounterId} onChangeText={setEncounterId} autoComplete="off" />
          <Field label="Note" value={body} onChangeText={setBody} autoComplete="off" multiline />
          <Pressable
            accessibilityRole="button"
            disabled={mutation.isPending}
            style={styles.button}
            onPress={() => mutation.mutate()}
          >
            <Text style={styles.buttonText}>{mutation.isPending ? "Saving…" : "Save note"}</Text>
          </Pressable>
        </>
      ) : (
        <Notice>Adding a consultation note is unavailable for this account.</Notice>
      )}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {describeError(error)}
        </Text>
      ) : null}
      {mutation.data?.status === "synced" ? <Notice>The note was recorded.</Notice> : null}
      {mutation.data?.status === "pending" || mutation.data?.status === "in_flight" ? (
        <Notice>Saved on this device.</Notice>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 8,
    minHeight: 48,
    justifyContent: "center",
  },
  buttonText: {
    color: colors.primaryText,
    fontSize: 16,
    fontWeight: "600",
  },
  error: {
    color: colors.danger,
    fontSize: 14,
  },
});
