import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ErrorState, Field, LoadingState, MessageState } from "@/components/states";
import { colors, Notice } from "@/components/ui";
import { allowed } from "@/features/access/workspace";
import { useAuth } from "@/features/auth/auth-provider";
import { SyncStatus } from "@/components/sync-status";
import { withQuery } from "@/lib/api/client";
import { describeError, fieldMessages } from "@/lib/api/errors";
import type { Encounter } from "@/lib/api/types";
import { loadCachedPage } from "@/offline/repositories/read-repository";
import { listLocalRecords, queueVital } from "@/offline/repositories/clinical-repository";
import { getOperation } from "@/offline/outbox/outbox-repository";
import { runSync } from "@/offline/sync/worker";
import { shortId } from "@/lib/format";

const measurements = [
  ["temperature", "Temperature"],
  ["pulse", "Pulse"],
  ["respiratory_rate", "Respiratory rate"],
  ["systolic", "Systolic"],
  ["diastolic", "Diastolic"],
  ["spo2", "SpO2"],
  ["weight_kg", "Weight kg"],
  ["height_cm", "Height cm"],
] as const;

export function VitalsScreen() {
  const { isLoading, account, error, refetchAccount } = useAuth();
  if (isLoading) {
    return <LoadingState />;
  }
  if (error || !account) {
    return <ErrorState error={error} onRetry={() => refetchAccount()} />;
  }
  const canView = allowed(account.permissions, "encounters.view");
  const canCreate = allowed(account.permissions, "encounters.create");
  if (!canView && !canCreate) {
    return <MessageState title="Vital signs" detail="You do not have permission to open this page." />;
  }
  return <VitalsForm canView={canView} canCreate={canCreate} />;
}

function VitalsForm({ canView, canCreate }: { canView: boolean; canCreate: boolean }) {
  const { account, branchId } = useAuth();
  const queryClient = useQueryClient();
  const [encounterId, setEncounterId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<unknown>(null);
  const encounters = useQuery({
    queryKey: ["encounters", "vitals", branchId, account?.id],
    enabled: canView,
    queryFn: () =>
      loadCachedPage<Encounter>({
        userId: account?.id ?? null,
        branchId,
        resource: "encounters",
        path: withQuery("/encounters/", {}),
      }),
  });
  const localVitals = useQuery({
    queryKey: ["local-records", "vital", account?.id],
    enabled: Boolean(account?.id),
    queryFn: () => listLocalRecords(account?.id ?? "", "vital"),
  });
  const mutation = useMutation({
    mutationFn: async () => {
      if (!account?.id) {
        throw new Error("Sign in is required.");
      }
      const reading: Record<string, string> = {};
      for (const [key] of measurements) {
        const value = values[key]?.trim();
        if (value) {
          reading[key] = value;
        }
      }
      if (Object.keys(reading).length === 0) {
        throw new Error("Enter a measurement.");
      }
      const operation = queueVital({
        userId: account.id,
        branchId,
        encounterId: encounterId.trim(),
        measurements: reading,
      });
      await runSync(account.id);
      const current = getOperation(operation.operationId) ?? operation;
      if (current.status === "conflict" || current.status === "failed") {
        throw new Error(current.error || "The vital signs were not recorded.");
      }
      return current;
    },
    onSuccess: async () => {
      setValues({});
      setSubmitError(null);
      await queryClient.invalidateQueries({ queryKey: ["local-records", "vital"] });
      await queryClient.invalidateQueries({ queryKey: ["encounters"] });
    },
    onError: (caught) => setSubmitError(caught),
  });

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={styles.title}>
        Vital signs
      </Text>
      <SyncStatus />
      <Notice>A new reading is saved on this device and sent when the clinic API can be reached. It does not replace an earlier reading.</Notice>
      {canView && encounters.isLoading ? <LoadingState /> : null}
      {canView && encounters.isError ? (
        <ErrorState error={encounters.error} onRetry={() => void encounters.refetch()} />
      ) : null}
      {encounters.data?.records.map((encounter) => (
        <Pressable
          key={encounter.id}
          accessibilityRole="button"
          accessibilityState={{ selected: encounterId === encounter.id }}
          style={[styles.choice, encounterId === encounter.id && styles.choiceSelected]}
          onPress={() => setEncounterId(encounter.id)}
        >
          <Text style={styles.choiceText}>
            {encounter.status} · {shortId(encounter.patient)}
          </Text>
        </Pressable>
      ))}
      <Field label="Encounter" value={encounterId} onChangeText={setEncounterId} autoComplete="off" />
      {canCreate
        ? measurements.map(([key, label]) => (
            <View key={key}>
              <Field
                label={label}
                value={values[key] ?? ""}
                keyboardType="decimal-pad"
                autoComplete="off"
                onChangeText={(next) => setValues((current) => ({ ...current, [key]: next }))}
              />
              <FieldAlert error={submitError} name={key} />
            </View>
          ))
        : null}
      {canCreate ? (
        <Pressable
          accessibilityRole="button"
          disabled={mutation.isPending || encounterId.trim().length === 0}
          style={styles.button}
          onPress={() => mutation.mutate()}
        >
          <Text style={styles.buttonText}>{mutation.isPending ? "Saving…" : "Record vital signs"}</Text>
        </Pressable>
      ) : (
        <Notice>Recording vital signs is unavailable for this account.</Notice>
      )}
      {submitError ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {describeError(submitError)}
        </Text>
      ) : null}
      {mutation.data?.status === "synced" ? <Notice>The vital signs were recorded.</Notice> : null}
      {mutation.data?.status === "pending" || mutation.data?.status === "in_flight" ? (
        <Notice>Saved on this device.</Notice>
      ) : null}
      {localVitals.data?.map((row) => (
        <Notice key={row.localId}>
          {`${row.syncStatus} · ${shortId(row.parentId)}${row.error ? ` · ${row.error}` : ""}`}
        </Notice>
      ))}
    </ScrollView>
  );
}

function FieldAlert({ error, name }: { error: unknown; name: string }) {
  const messages = fieldMessages(error, name);
  if (messages.length === 0) {
    return null;
  }
  return (
    <Text accessibilityRole="alert" style={styles.error}>
      {messages.join(" ")}
    </Text>
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
  choice: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  choiceSelected: {
    borderColor: colors.primary,
  },
  choiceText: {
    color: colors.text,
    fontSize: 16,
  },
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
