import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { RecordList, RowText, StatusRow } from "@/components/record-list";
import { Field } from "@/components/states";
import { SyncStatus } from "@/components/sync-status";
import { colors, Notice } from "@/components/ui";
import { RequirePermission } from "@/features/access/guards";
import { allowed } from "@/features/access/workspace";
import { useAuth } from "@/features/auth/auth-provider";
import { describeError } from "@/lib/api/errors";
import type { Prescription } from "@/lib/api/types";
import { formatWhen, shortId } from "@/lib/format";
import type { PrescriptionSubmitBody } from "@/offline/database/schema";
import { getOperation } from "@/offline/outbox/outbox-repository";
import { listLocalRecords, savePrescriptionDraft, submitPrescriptionDraft } from "@/offline/repositories/clinical-repository";
import { loadMedicineChoices } from "@/offline/repositories/read-repository";
import { runSync } from "@/offline/sync/worker";

export function PrescriptionScreen() {
  return (
    <RequirePermission permission="prescriptions.view" title="Prescriptions">
      <RecordList<Prescription>
        title="Prescriptions"
        resource="prescriptions"
        path="/prescriptions/"
        emptyLabel="prescriptions"
        headerExtra={<PrescriptionDrafts />}
        renderItem={(row) => (
          <>
            <StatusRow value={row.status} />
            <RowText label="Created" value={formatWhen(row.created_at)} />
            <RowText label="Patient" value={shortId(row.patient)} />
            <RowText label="Doctor" value={shortId(row.doctor)} />
          </>
        )}
      />
    </RequirePermission>
  );
}

function PrescriptionDrafts() {
  const { account, branchId } = useAuth();
  const queryClient = useQueryClient();
  const [encounterId, setEncounterId] = useState("");
  const [medicine, setMedicine] = useState("");
  const [quantity, setQuantity] = useState("");
  const [dosage, setDosage] = useState("");
  const [frequency, setFrequency] = useState("");
  const [durationDays, setDurationDays] = useState("");
  const [error, setError] = useState<unknown>(null);
  const canCreate = Boolean(account && allowed(account.permissions, "prescriptions.create"));
  const drafts = useQuery({
    queryKey: ["local-records", "prescription_draft", account?.id],
    enabled: Boolean(account?.id),
    queryFn: () => listLocalRecords(account?.id ?? "", "prescription_draft"),
  });
  const medicines = useQuery({
    queryKey: ["medicines", "choices", branchId, account?.id],
    enabled: canCreate,
    queryFn: () => loadMedicineChoices(account?.id ?? null, branchId),
  });
  const save = useMutation({
    mutationFn: async () => {
      if (!account?.id) {
        throw new Error("Sign in is required.");
      }
      const parsed = parseDraft(encounterId, medicine, quantity, dosage, frequency, durationDays);
      const saved = savePrescriptionDraft({ userId: account.id, branchId, ...parsed });
      if (!saved) {
        throw new Error("The draft could not be saved on this device.");
      }
      return saved;
    },
    onSuccess: async () => {
      setError(null);
      setDosage("");
      await queryClient.invalidateQueries({ queryKey: ["local-records", "prescription_draft"] });
    },
    onError: (caught) => setError(caught),
  });
  const submit = useMutation({
    mutationFn: async (localId: string) => {
      if (!account?.id) {
        throw new Error("Sign in is required.");
      }
      const operation = submitPrescriptionDraft(localId, account.id);
      await runSync(account.id);
      const current = getOperation(operation.operationId) ?? operation;
      if (current.status === "conflict" || current.status === "failed") {
        throw new Error(current.error || "The prescription draft was not recorded.");
      }
      return current;
    },
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["local-records", "prescription_draft"] });
      await queryClient.invalidateQueries({ queryKey: ["prescriptions"] });
    },
    onError: (caught) => setError(caught),
  });

  return (
    <View style={styles.block}>
      <SyncStatus />
      <Notice>
        A draft stays on this device until you submit it. Submit creates a new prescription. It does not change an
        existing one.
      </Notice>
      {drafts.data?.map((row) => {
        const payload = row.payload as Partial<PrescriptionSubmitBody>;
        const canSubmit =
          row.syncStatus === "draft" ||
          (row.syncStatus === "failed" && !payload.serverPrescriptionId && !payload.serverItemId);
        return (
          <View key={row.localId} style={styles.draft}>
            <Text style={styles.draftText}>
              {`${row.syncStatus} · ${payload.dosage || "draft"} · ${shortId(payload.encounterId)}`}
            </Text>
            {row.error ? <Text style={styles.error}>{row.error}</Text> : null}
            {canCreate && canSubmit ? (
              <Pressable
                accessibilityRole="button"
                disabled={submit.isPending}
                style={styles.secondary}
                onPress={() => submit.mutate(row.localId)}
              >
                <Text style={styles.secondaryText}>Submit draft</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
      {canCreate ? (
        <>
          <Field label="Encounter" value={encounterId} onChangeText={setEncounterId} autoComplete="off" />
          <Field label="Medicine" value={medicine} onChangeText={setMedicine} autoComplete="off" />
          {medicines.data?.map((choice) => (
            <Pressable
              key={choice.id}
              accessibilityRole="button"
              style={styles.secondary}
              onPress={() => setMedicine(choice.id)}
            >
              <Text style={styles.secondaryText}>
                {choice.name} ({choice.code})
              </Text>
            </Pressable>
          ))}
          <Field label="Quantity" value={quantity} onChangeText={setQuantity} keyboardType="number-pad" autoComplete="off" />
          <Field label="Dosage" value={dosage} onChangeText={setDosage} autoComplete="off" />
          <Field label="Frequency" value={frequency} onChangeText={setFrequency} autoComplete="off" />
          <Field label="Duration days" value={durationDays} onChangeText={setDurationDays} keyboardType="number-pad" autoComplete="off" />
          <Pressable
            accessibilityRole="button"
            disabled={save.isPending}
            style={styles.button}
            onPress={() => save.mutate()}
          >
            <Text style={styles.buttonText}>{save.isPending ? "Saving…" : "Save draft"}</Text>
          </Pressable>
        </>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {describeError(error)}
        </Text>
      ) : null}
      {save.isSuccess ? <Notice>Draft saved on this device.</Notice> : null}
      {submit.data?.status === "synced" ? <Notice>The prescription was recorded.</Notice> : null}
      {submit.data?.status === "pending" || submit.data?.status === "in_flight" ? (
        <Notice>Saved on this device.</Notice>
      ) : null}
    </View>
  );
}

function parseDraft(
  encounterId: string,
  medicine: string,
  quantityText: string,
  dosage: string,
  frequency: string,
  durationText: string,
) {
  const quantity = Number(quantityText);
  if (!encounterId.trim() || !medicine.trim()) {
    throw new Error("Encounter and medicine are required.");
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error("Quantity must be a whole number of at least 1.");
  }
  if (!dosage.trim()) {
    throw new Error("Dosage is required.");
  }
  const durationDays = durationText.trim() ? Number(durationText) : null;
  if (durationText.trim() && (durationDays == null || !Number.isInteger(durationDays) || durationDays < 1)) {
    throw new Error("Duration must be a whole number of days.");
  }
  return {
    encounterId: encounterId.trim(),
    medicine: medicine.trim(),
    quantity,
    dosage: dosage.trim(),
    frequency: frequency.trim(),
    durationDays,
  };
}

const styles = StyleSheet.create({
  block: {
    gap: 12,
  },
  draft: {
    gap: 6,
  },
  draftText: {
    color: colors.text,
    fontSize: 15,
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
  secondary: {
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  secondaryText: {
    color: colors.text,
    fontSize: 15,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
  },
});
