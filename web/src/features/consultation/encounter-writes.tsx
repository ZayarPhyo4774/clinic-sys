"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ActionBar } from "@/components/action-bar";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PrintRecordButton } from "@/components/print/print-record-button";
import { LabTestSelect, MedicineSelect } from "@/components/entity-picker";
import { FormError, FormFieldError } from "@/components/form-field-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PanelTabs, PanelTabsContent, PanelTabsList, PanelTabsTrigger } from "@/components/panel-tabs";
import { cn } from "@/lib/utils";
import { allowed } from "@/features/access/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import { api } from "@/lib/api/client";
import { validationError } from "@/lib/api/errors";
import {
  clinicalNoteSchema,
  diagnosisSchema,
  followUpSchema,
  formatZodError,
  labOrderCreateSchema,
  parseForm,
  prescriptionItemSchema,
  symptomSchema,
  treatmentPlanSchema,
  validateForm,
} from "@/lib/forms/schemas";
import type { Encounter, Invoice, LabOrder, Prescription } from "@/lib/api/types";
import { formatMedicineUnit, formatPrescriptionItemSummary } from "@/features/prescriptions/prescription-utils";
import { useMedicineLabelMap } from "@/features/prescriptions/use-medicine-labels";
import { ConsultationCcrForm } from "@/features/consultation/consultation-ccr-form";
import { queueConsultationNote } from "@/offline/repositories/clinical-repository";
import { isOnline } from "@/offline/connectivity/network";
import { requireOnlineMutation } from "@/offline/sync/policy";

export function CompleteEncounterButton({
  encounter,
  onUpdated,
}: {
  encounter: Encounter;
  onUpdated: () => void;
}) {
  const { account } = useAuth();
  const canComplete = Boolean(
    account &&
      allowed(account.permissions, "encounters.update") &&
      encounter.status === "open" &&
      encounter.phase === "consultation",
  );
  if (!canComplete) {
    return null;
  }
  return <CompleteEncounter encounterId={encounter.id} onUpdated={onUpdated} inline />;
}

export function EncounterWritePanel({
  encounter,
  onUpdated,
}: {
  encounter: Encounter;
  onUpdated: () => void;
}) {
  const { account } = useAuth();
  const isOpen = encounter.status === "open";
  const inConsultationPhase = encounter.phase === "consultation";
  const canView = Boolean(account && allowed(account.permissions, "encounters.view"));
  const canCreateFacts = Boolean(
    account && allowed(account.permissions, "encounters.create") && isOpen && inConsultationPhase,
  );
  const canComplete = Boolean(
    account && allowed(account.permissions, "encounters.update") && isOpen && inConsultationPhase,
  );
  const canPrescribe = Boolean(
    account && allowed(account.permissions, "prescriptions.create") && isOpen && inConsultationPhase,
  );
  const canLab = Boolean(
    account && allowed(account.permissions, "laboratory.manage") && isOpen && inConsultationPhase,
  );
  const canBill = Boolean(
    account && allowed(account.permissions, "billing.create") && isOpen && inConsultationPhase,
  );
  const printAction = canView ? (
    <PrintRecordButton href={`/consultation/${encounter.id}/print?auto=1`} label="Print record" />
  ) : null;

  if (isOpen && !inConsultationPhase && canView) {
    return (
      <Card className="shadow-premium-sm">
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">
            This visit is still in triage. Vitals are recorded from the queue board before the doctor starts the
            consultation.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!canCreateFacts && !canComplete && !canPrescribe && !canLab && !canBill) {
    if (encounter.status === "completed") {
      return (
        <Card className="shadow-premium-sm">
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
            <CardTitle className="text-base">Consultation completed</CardTitle>
            {printAction}
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground">The chart is read-only. Print the medical record when needed.</p>
          </CardContent>
        </Card>
      );
    }
    return printAction ? (
      <Card className="shadow-premium-sm">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-6">
          <p className="text-sm text-muted-foreground">View and print this consultation record.</p>
          {printAction}
        </CardContent>
      </Card>
    ) : null;
  }

  const defaultTab = canCreateFacts
    ? "assessment"
    : canPrescribe || canLab || canBill
      ? "orders"
      : "finish";

  return (
    <Card className="min-w-0 shadow-premium-sm">
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Document visit</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Work tab by tab. The chart updates on the left.</p>
          </div>
          {printAction}
        </div>
      </CardHeader>
      <CardContent>
        <PanelTabs defaultValue={defaultTab} className="min-w-0">
          <PanelTabsList>
            {canCreateFacts ? <PanelTabsTrigger value="assessment">Assessment</PanelTabsTrigger> : null}
            {canCreateFacts ? <PanelTabsTrigger value="ccr">CCR</PanelTabsTrigger> : null}
            {canCreateFacts ? <PanelTabsTrigger value="plan">Plan</PanelTabsTrigger> : null}
            {canPrescribe || canLab || canBill ? <PanelTabsTrigger value="orders">Orders</PanelTabsTrigger> : null}
            {canComplete ? <PanelTabsTrigger value="finish">Finish</PanelTabsTrigger> : null}
          </PanelTabsList>

          {canCreateFacts ? (
            <PanelTabsContent value="assessment" className="mt-4 space-y-4">
              <AddNoteForm encounterId={encounter.id} onUpdated={onUpdated} bare />
              <AddSymptomForm encounterId={encounter.id} onUpdated={onUpdated} bare />
              <AddDiagnosisForm encounterId={encounter.id} onUpdated={onUpdated} bare />
            </PanelTabsContent>
          ) : null}

          {canCreateFacts ? (
            <PanelTabsContent value="ccr" className="mt-4">
              <ConsultationCcrForm encounterId={encounter.id} onUpdated={onUpdated} />
            </PanelTabsContent>
          ) : null}

          {canCreateFacts ? (
            <PanelTabsContent value="plan" className="mt-4 space-y-4">
              <AddTreatmentPlanForm encounterId={encounter.id} onUpdated={onUpdated} bare />
              <AddFollowUpForm encounterId={encounter.id} onUpdated={onUpdated} bare />
            </PanelTabsContent>
          ) : null}

          {canPrescribe || canLab || canBill ? (
            <PanelTabsContent value="orders" className="mt-4 space-y-4">
              {canPrescribe ? (
                <CreatePrescriptionForm encounterId={encounter.id} compact bare onUpdated={onUpdated} />
              ) : null}
              {canLab ? <CreateLabOrderForm encounterId={encounter.id} bare /> : null}
              {canBill ? <CreateInvoiceButton encounterId={encounter.id} /> : null}
            </PanelTabsContent>
          ) : null}

          {canComplete ? (
            <PanelTabsContent value="finish" className="mt-4">
              <p className="text-sm text-muted-foreground">
                Use <strong className="font-medium text-foreground">Complete consultation</strong> in the page header
                when documentation is done. Then complete the visit from the queue board.
              </p>
            </PanelTabsContent>
          ) : null}
        </PanelTabs>
      </CardContent>
    </Card>
  );
}

function formClass(bare?: boolean, extra?: string) {
  return cn(bare ? cn("space-y-3", extra) : cn("space-y-3 rounded-lg border bg-card p-4", extra));
}

function CompleteEncounter({
  encounterId,
  onUpdated,
  inline = false,
}: {
  encounterId: string;
  onUpdated: () => void;
  inline?: boolean;
}) {
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("encounters.complete", isOnline());
      return api(`/encounters/${encounterId}/complete/`, { method: "POST", body: "{}" });
    },
    onSuccess: async () => {
      setConfirmOpen(false);
      toast.success("Consultation completed.");
      await queryClient.invalidateQueries({ queryKey: ["encounters"] });
      onUpdated();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "The consultation could not be completed.");
    },
  });

  const button = (
    <Button type="button" disabled={mutation.isPending} onClick={() => setConfirmOpen(true)}>
      {mutation.isPending ? "Completing…" : "Complete consultation"}
    </Button>
  );

  return (
    <>
      {inline ? button : <ActionBar>{button}</ActionBar>}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Complete this consultation?"
        description="No further vitals, notes, or orders can be added after completion."
        confirmLabel="Complete consultation"
        pending={mutation.isPending}
        onConfirm={() => mutation.mutate()}
      />
    </>
  );
}

function AddNoteForm({
  encounterId,
  onUpdated,
  bare = false,
}: {
  encounterId: string;
  onUpdated: () => void;
  bare?: boolean;
}) {
  const { account } = useAuth();
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [error, setError] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: async (noteBody: string) => {
      requireOnlineMutation("consultation.note", isOnline());
      if (!isOnline()) {
        if (!account?.id) {
          throw new Error("Sign in is required.");
        }
        await queueConsultationNote({ userId: account.id, encounterId, body: noteBody });
        return;
      }
      return api(`/encounters/${encounterId}/notes/`, {
        method: "POST",
        body: JSON.stringify({ body: noteBody }),
      });
    },
    onSuccess: async () => {
      setBody("");
      setError(null);
      toast.success(isOnline() ? "Note added." : "Note saved on this device and will sync when online.");
      await queryClient.invalidateQueries({ queryKey: ["encounters"] });
      onUpdated();
    },
    onError: (caught) => setError(caught),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const parsed = parseForm(clinicalNoteSchema, { body });
    if (!parsed.ok) {
      setError(validationError(formatZodError(parsed.error)));
      return;
    }
    mutation.mutate(parsed.data.body);
  }

  return (
    <form className={formClass(bare)} onSubmit={onSubmit}>
      <div className="space-y-2">
        <Label htmlFor="note_body">Subjective / objective findings</Label>
        <textarea
          id="note_body"
          rows={4}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          className={cn(
            "flex min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-premium-sm ring-offset-background transition-colors placeholder:text-muted-foreground focus-visible:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          )}
        />
        <FormFieldError error={error} name="body" />
      </div>
      <Button type="submit" size="sm" disabled={mutation.isPending}>
        {mutation.isPending ? "Saving…" : "Add note"}
      </Button>
      <FormError error={error} />
    </form>
  );
}

type PrescriptionDraftItem = {
  source: "inventory" | "external";
  medicine: string;
  medicineLabel: string;
  medicineName: string;
  medicineUnit: string;
  quantity: string;
  dosage: string;
  frequency: string;
  durationDays: string;
};

const emptyDraftItem = (): PrescriptionDraftItem => ({
  source: "inventory",
  medicine: "",
  medicineLabel: "",
  medicineName: "",
  medicineUnit: "",
  quantity: "1",
  dosage: "",
  frequency: "",
  durationDays: "",
});

function AddSymptomForm({
  encounterId,
  onUpdated,
  bare = false,
}: {
  encounterId: string;
  onUpdated: () => void;
  bare?: boolean;
}) {
  const queryClient = useQueryClient();
  const [description, setDescription] = useState("");
  const [error, setError] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("encounters.symptom", isOnline());
      return api(`/encounters/${encounterId}/symptoms/`, {
        method: "POST",
        body: JSON.stringify({ description: description.trim() }),
      });
    },
    onSuccess: async () => {
      setDescription("");
      setError(null);
      toast.success("Symptom recorded.");
      await queryClient.invalidateQueries({ queryKey: ["encounters"] });
      onUpdated();
    },
    onError: (caught) => setError(caught),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = validateForm(symptomSchema, { description }, setError);
    if (!data) {
      return;
    }
    mutation.mutate();
  }

  return (
    <form className={formClass(bare)} onSubmit={onSubmit}>
      <div className="space-y-2">
        <Label htmlFor="symptom_description">Description</Label>
        <Input id="symptom_description" value={description} onChange={(event) => setDescription(event.target.value)} />
        <FormFieldError error={error} name="description" />
      </div>
      <Button type="submit" size="sm" disabled={mutation.isPending}>
        {mutation.isPending ? "Saving…" : "Add symptom"}
      </Button>
      <FormError error={error} />
    </form>
  );
}

function AddDiagnosisForm({
  encounterId,
  onUpdated,
  bare = false,
}: {
  encounterId: string;
  onUpdated: () => void;
  bare?: boolean;
}) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("encounters.diagnosis", isOnline());
      return api(`/encounters/${encounterId}/diagnoses/`, {
        method: "POST",
        body: JSON.stringify({ code: code.trim(), description: description.trim() }),
      });
    },
    onSuccess: async () => {
      setCode("");
      setDescription("");
      setError(null);
      toast.success("Diagnosis recorded.");
      await queryClient.invalidateQueries({ queryKey: ["encounters"] });
      onUpdated();
    },
    onError: (caught) => setError(caught),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!validateForm(diagnosisSchema, { code, description }, setError)) {
      return;
    }
    mutation.mutate();
  }

  return (
    <form className={formClass(bare, "grid gap-3 md:grid-cols-2")} onSubmit={onSubmit}>
      <div className="space-y-2">
        <Label htmlFor="diagnosis_code">Code</Label>
        <Input id="diagnosis_code" value={code} onChange={(event) => setCode(event.target.value)} />
        <FormFieldError error={error} name="code" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="diagnosis_description">Description</Label>
        <Input
          id="diagnosis_description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <FormFieldError error={error} name="description" />
      </div>
      <div className="md:col-span-2">
        <Button type="submit" size="sm" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Add diagnosis"}
        </Button>
      </div>
      <div className="md:col-span-2">
        <FormError error={error} />
      </div>
    </form>
  );
}

function AddTreatmentPlanForm({
  encounterId,
  onUpdated,
  bare = false,
}: {
  encounterId: string;
  onUpdated: () => void;
  bare?: boolean;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("encounters.plan", isOnline());
      return api(`/encounters/${encounterId}/treatment-plans/`, {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), details: details.trim() }),
      });
    },
    onSuccess: async () => {
      setTitle("");
      setDetails("");
      setError(null);
      toast.success("Treatment plan recorded.");
      await queryClient.invalidateQueries({ queryKey: ["encounters"] });
      onUpdated();
    },
    onError: (caught) => setError(caught),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!validateForm(treatmentPlanSchema, { title, details }, setError)) {
      return;
    }
    mutation.mutate();
  }

  return (
    <form className={formClass(bare, "grid gap-3 md:grid-cols-2")} onSubmit={onSubmit}>
      <div className="space-y-2">
        <Label htmlFor="plan_title">Title</Label>
        <Input id="plan_title" value={title} onChange={(event) => setTitle(event.target.value)} />
        <FormFieldError error={error} name="title" />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="plan_details">Details</Label>
        <textarea
          id="plan_details"
          rows={3}
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          className={cn(
            "flex min-h-20 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-premium-sm ring-offset-background transition-colors placeholder:text-muted-foreground focus-visible:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          )}
        />
        <FormFieldError error={error} name="details" />
      </div>
      <div className="md:col-span-2">
        <Button type="submit" size="sm" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Add plan"}
        </Button>
      </div>
      <div className="md:col-span-2">
        <FormError error={error} />
      </div>
    </form>
  );
}

function AddFollowUpForm({
  encounterId,
  onUpdated,
  bare = false,
}: {
  encounterId: string;
  onUpdated: () => void;
  bare?: boolean;
}) {
  const queryClient = useQueryClient();
  const [followUpOn, setFollowUpOn] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("encounters.follow_up", isOnline());
      return api(`/encounters/${encounterId}/follow-ups/`, {
        method: "POST",
        body: JSON.stringify({
          follow_up_on: followUpOn,
          note: note.trim() || undefined,
        }),
      });
    },
    onSuccess: async () => {
      setFollowUpOn("");
      setNote("");
      setError(null);
      toast.success("Follow-up scheduled.");
      await queryClient.invalidateQueries({ queryKey: ["encounters"] });
      onUpdated();
    },
    onError: (caught) => setError(caught),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!validateForm(followUpSchema, { follow_up_on: followUpOn, note }, setError)) {
      return;
    }
    mutation.mutate();
  }

  return (
    <form className={formClass(bare, "grid gap-3 md:grid-cols-2")} onSubmit={onSubmit}>
      <div className="space-y-2">
        <Label htmlFor="follow_up_on">Follow-up date</Label>
        <Input id="follow_up_on" type="date" value={followUpOn} onChange={(event) => setFollowUpOn(event.target.value)} />
        <FormFieldError error={error} name="follow_up_on" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="follow_up_note">Note</Label>
        <Input id="follow_up_note" value={note} onChange={(event) => setNote(event.target.value)} />
      </div>
      <div className="md:col-span-2">
        <Button type="submit" size="sm" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Add follow-up"}
        </Button>
      </div>
      <div className="md:col-span-2">
        <FormError error={error} />
      </div>
    </form>
  );
}

function CreatePrescriptionForm({
  encounterId,
  compact = false,
  bare = false,
  onUpdated,
}: {
  encounterId: string;
  compact?: boolean;
  bare?: boolean;
  onUpdated?: () => void;
}) {
  const queryClient = useQueryClient();
  const { labelFor, unitFor } = useMedicineLabelMap();
  const [draft, setDraft] = useState<PrescriptionDraftItem>(emptyDraftItem);
  const [items, setItems] = useState<PrescriptionDraftItem[]>([]);
  const [error, setError] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: async (lines: PrescriptionDraftItem[]) => {
      requireOnlineMutation("prescriptions.create", isOnline());
      const prescription = await api<Prescription>("/prescriptions/", {
        method: "POST",
        body: JSON.stringify({ encounter: encounterId }),
      });
      for (const line of lines) {
        await api(`/prescriptions/${prescription.id}/items/`, {
          method: "POST",
          body: JSON.stringify({
            source: line.source,
            medicine: line.source === "inventory" ? line.medicine : undefined,
            medicine_name: line.source === "external" ? line.medicineName : undefined,
            quantity: Number(line.quantity || 1),
            dosage: line.dosage,
            frequency: line.frequency || undefined,
            duration_days: line.durationDays ? Number(line.durationDays) : undefined,
          }),
        });
      }
      return prescription;
    },
    onSuccess: async () => {
      setDraft(emptyDraftItem());
      setItems([]);
      setError(null);
      toast.success("Prescription saved to this visit.");
      await queryClient.invalidateQueries({ queryKey: ["prescriptions"] });
      await queryClient.invalidateQueries({ queryKey: ["prescription-items"] });
      onUpdated?.();
    },
    onError: (caught) => setError(caught),
  });

  function addLine() {
    setError(null);
    if (
      !validateForm(
        prescriptionItemSchema,
        {
          source: draft.source,
          medicine: draft.medicine,
          medicine_name: draft.medicineName,
          quantity: draft.quantity || "1",
          dosage: draft.dosage,
          frequency: draft.frequency || "daily",
          duration_days: draft.durationDays ? Number(draft.durationDays) : null,
        },
        setError,
      )
    ) {
      return;
    }
    setItems((current) => [
      ...current,
      {
        ...draft,
        medicineLabel:
          draft.source === "inventory" ? labelFor(draft.medicine) : draft.medicineName.trim(),
        medicineUnit: draft.source === "inventory" ? unitFor(draft.medicine) : "",
      },
    ]);
    setDraft(emptyDraftItem());
  }

  function removeLine(index: number) {
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function draftHasContent() {
    return Boolean(
      draft.dosage ||
        draft.medicine ||
        draft.medicineName ||
        (draft.quantity && draft.quantity !== "1") ||
        draft.frequency ||
        draft.durationDays,
    );
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const lines = [...items];
    if (draftHasContent()) {
      const medicineOk = draft.source === "inventory" ? draft.medicine : draft.medicineName.trim();
      if (!medicineOk || !draft.dosage) {
        setError(new Error("Complete the current line or clear it before creating."));
        return;
      }
      lines.push({
        ...draft,
        quantity: draft.quantity || "1",
        medicineLabel:
          draft.source === "inventory"
            ? draft.medicineLabel || labelFor(draft.medicine)
            : draft.medicineName.trim(),
        medicineUnit: draft.source === "inventory" ? draft.medicineUnit || unitFor(draft.medicine) : "",
      });
    }
    if (lines.length === 0) {
      setError(new Error("Add at least one prescription item."));
      return;
    }
    mutation.mutate(lines);
  }

  return (
    <form
      className={cn(formClass(bare, "min-w-0 space-y-4"), !bare && (compact ? "p-3" : "p-4"))}
      onSubmit={onSubmit}
    >
      {!bare ? <p className="text-sm font-medium">Create prescription</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={draft.source === "inventory" ? "default" : "outline"}
          onClick={() => setDraft((current) => ({ ...emptyDraftItem(), source: "inventory" }))}
        >
          From clinic stock
        </Button>
        <Button
          type="button"
          size="sm"
          variant={draft.source === "external" ? "default" : "outline"}
          onClick={() => setDraft((current) => ({ ...emptyDraftItem(), source: "external" }))}
        >
          External / note only
        </Button>
      </div>
      <div className={cn("grid gap-3", compact ? "grid-cols-1" : "md:grid-cols-2")}>
        {draft.source === "inventory" ? (
          <MedicineSelect
            id="rx_medicine"
            value={draft.medicine}
            onValueChange={(medicine) =>
              setDraft((current) => ({
                ...current,
                medicine,
                medicineLabel: labelFor(medicine),
                medicineUnit: unitFor(medicine),
              }))
            }
          />
        ) : (
          <div className="space-y-2">
            <Label htmlFor="rx_medicine_name">Medicine name</Label>
            <Input
              id="rx_medicine_name"
              value={draft.medicineName}
              placeholder="Name as written for the patient"
              onChange={(event) =>
                setDraft((current) => ({ ...current, medicineName: event.target.value }))
              }
            />
            <p className="text-xs text-muted-foreground">Use when the medicine is not in clinic inventory.</p>
          </div>
        )}
        {draft.source === "inventory" ? (
          <div className="space-y-2">
            <Label htmlFor="rx_quantity">
              Quantity
              {draft.medicineUnit
                ? ` (${formatMedicineUnit(draft.medicineUnit, draft.quantity || 2)})`
                : ""}
            </Label>
            <Input
              id="rx_quantity"
              inputMode="numeric"
              value={draft.quantity}
              onChange={(event) => setDraft((current) => ({ ...current, quantity: event.target.value }))}
            />
          </div>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="rx_dosage">Dosage</Label>
          <Input
            id="rx_dosage"
            value={draft.dosage}
            onChange={(event) => setDraft((current) => ({ ...current, dosage: event.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rx_frequency">Frequency</Label>
          <Input
            id="rx_frequency"
            value={draft.frequency}
            onChange={(event) => setDraft((current) => ({ ...current, frequency: event.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rx_duration">Duration (days)</Label>
          <Input
            id="rx_duration"
            inputMode="numeric"
            value={draft.durationDays}
            onChange={(event) => setDraft((current) => ({ ...current, durationDays: event.target.value }))}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addLine}>
          Add line
        </Button>
      </div>
      {items.length > 0 ? (
        <ul className="space-y-2 text-sm">
          {items.map((line, index) => (
            <li
              key={`${line.source}-${line.medicine || line.medicineName}-${index}`}
              className={cn(
                "gap-2 rounded-md border px-3 py-2",
                compact ? "flex flex-col" : "flex items-center justify-between",
              )}
            >
              <span className="min-w-0 break-words text-sm">
                {formatPrescriptionItemSummary(
                  {
                    dosage: line.dosage,
                    frequency: line.frequency,
                    duration_days: line.durationDays ? Number(line.durationDays) : 0,
                    quantity: line.quantity,
                  },
                  line.medicineLabel ||
                    (line.source === "inventory" ? labelFor(line.medicine) : line.medicineName),
                  line.medicineUnit || (line.source === "inventory" ? unitFor(line.medicine) : ""),
                )}
                {line.source === "external" ? " · external" : ""}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={compact ? "self-start" : undefined}
                onClick={() => removeLine(index)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <Button type="submit" size={compact ? "sm" : "default"} className="w-full sm:w-auto" disabled={mutation.isPending}>
        {mutation.isPending ? "Creating…" : "Create prescription"}
      </Button>
      <FormFieldError error={error} name="medicine" />
      <FormFieldError error={error} name="quantity" />
      <FormFieldError error={error} name="dosage" />
      <FormError error={error} />
    </form>
  );
}

function CreateLabOrderForm({ encounterId, bare = false }: { encounterId: string; bare?: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [labTest, setLabTest] = useState("");
  const [error, setError] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      requireOnlineMutation("lab_orders.create", isOnline());
      const order = await api<LabOrder>("/lab-orders/", {
        method: "POST",
        body: JSON.stringify({ encounter: encounterId }),
      });
      await api(`/lab-orders/${order.id}/items/`, {
        method: "POST",
        body: JSON.stringify({ lab_test: labTest }),
      });
      return order;
    },
    onSuccess: async (order) => {
      setLabTest("");
      setError(null);
      toast.success("Lab order created.");
      await queryClient.invalidateQueries({ queryKey: ["lab-orders"] });
      router.push(`/laboratory/${order.id}`);
    },
    onError: (caught) => setError(caught),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!validateForm(labOrderCreateSchema, { lab_test: labTest }, setError)) {
      return;
    }
    mutation.mutate();
  }

  return (
    <form className={formClass(bare)} onSubmit={onSubmit}>
      {!bare ? <p className="text-sm font-medium">Create lab order</p> : null}
      <LabTestSelect id="lab_test" value={labTest} onValueChange={setLabTest} />
      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? "Creating…" : "Create lab order"}
      </Button>
      <FormFieldError error={error} name="lab_test" />
      <FormError error={error} />
    </form>
  );
}

function CreateInvoiceButton({ encounterId }: { encounterId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("invoices.create", isOnline());
      return api<Invoice>("/invoices/", {
        method: "POST",
        body: JSON.stringify({ encounter: encounterId }),
      });
    },
    onSuccess: async (invoice) => {
      toast.success("Invoice created.");
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
      router.push(`/billing/${invoice.id}`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "The invoice could not be created.");
    },
  });

  return (
    <ActionBar>
      <Button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? "Creating…" : "Create invoice"}
      </Button>
    </ActionBar>
  );
}
