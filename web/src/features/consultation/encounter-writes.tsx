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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  buildVitalsBody,
  vitalsSchema,
} from "@/lib/forms/schemas";
import { useVitalUnits } from "@/hooks/use-vital-units";
import type { Encounter, Invoice, LabOrder, Prescription, VitalUnitFieldName } from "@/lib/api/types";
import { formatMedicineUnit, formatPrescriptionItemSummary } from "@/features/prescriptions/prescription-utils";
import { useMedicineLabelMap } from "@/features/prescriptions/use-medicine-labels";
import {
  DEFAULT_VITAL_UNITS,
  EMPTY_VITAL_FORM_VALUES,
  vitalFieldLabel,
} from "@/lib/vitals/units";
import { queueConsultationNote, queueVital } from "@/offline/repositories/clinical-repository";
import { isOnline } from "@/offline/connectivity/network";
import { requireOnlineMutation } from "@/offline/sync/policy";

export function EncounterWritePanel({
  encounter,
  onUpdated,
  layout = "stack",
}: {
  encounter: Encounter;
  onUpdated: () => void;
  layout?: "stack" | "sidebar";
}) {
  const { account } = useAuth();
  const isOpen = encounter.status === "open";
  const canView = Boolean(account && allowed(account.permissions, "encounters.view"));
  const canCreateFacts = Boolean(account && allowed(account.permissions, "encounters.create") && isOpen);
  const canComplete = Boolean(account && allowed(account.permissions, "encounters.update") && isOpen);
  const canPrescribe = Boolean(account && allowed(account.permissions, "prescriptions.create") && isOpen);
  const canLab = Boolean(account && allowed(account.permissions, "laboratory.manage") && isOpen);
  const canBill = Boolean(account && allowed(account.permissions, "billing.create") && isOpen);
  const printAction = canView ? (
    <PrintRecordButton href={`/consultation/${encounter.id}/print?auto=1`} label="Print record" />
  ) : null;

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

  const vitalsSection = canCreateFacts ? (
    <>
      <AddVitalsForm encounterId={encounter.id} onUpdated={onUpdated} compact={layout === "sidebar"} />
      <AddNoteForm encounterId={encounter.id} onUpdated={onUpdated} />
    </>
  ) : null;

  const assessmentSection = canCreateFacts ? (
    <>
      <AddSymptomForm encounterId={encounter.id} onUpdated={onUpdated} />
      <AddDiagnosisForm encounterId={encounter.id} onUpdated={onUpdated} />
    </>
  ) : null;

  const planSection = canCreateFacts ? (
    <>
      <AddTreatmentPlanForm encounterId={encounter.id} onUpdated={onUpdated} />
      <AddFollowUpForm encounterId={encounter.id} onUpdated={onUpdated} />
    </>
  ) : null;

  const ordersSection = (
    <>
      {canPrescribe ? <CreatePrescriptionForm encounterId={encounter.id} compact={layout === "sidebar"} /> : null}
      {canLab ? <CreateLabOrderForm encounterId={encounter.id} /> : null}
      {canBill ? <CreateInvoiceButton encounterId={encounter.id} /> : null}
    </>
  );

  if (layout === "sidebar") {
    const defaultTab = canCreateFacts ? "vitals" : canPrescribe || canLab || canBill ? "orders" : "vitals";

    return (
      <Card className="min-w-0 shadow-premium-sm">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle className="text-base">Document encounter</CardTitle>
            {printAction}
          </div>
          {canComplete ? <CompleteEncounter encounterId={encounter.id} onUpdated={onUpdated} /> : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs defaultValue={defaultTab}>
            <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
              {canCreateFacts ? <TabsTrigger value="vitals">Vitals</TabsTrigger> : null}
              {canCreateFacts ? <TabsTrigger value="assessment">Assessment</TabsTrigger> : null}
              {canCreateFacts ? <TabsTrigger value="plan">Plan</TabsTrigger> : null}
              {canPrescribe || canLab || canBill ? <TabsTrigger value="orders">Orders</TabsTrigger> : null}
            </TabsList>
            {canCreateFacts ? (
              <TabsContent value="vitals" className="mt-4 space-y-4">
                {vitalsSection}
              </TabsContent>
            ) : null}
            {canCreateFacts ? (
              <TabsContent value="assessment" className="mt-4 space-y-4">
                {assessmentSection}
              </TabsContent>
            ) : null}
            {canCreateFacts ? (
              <TabsContent value="plan" className="mt-4 space-y-4">
                {planSection}
              </TabsContent>
            ) : null}
            {canPrescribe || canLab || canBill ? (
              <TabsContent value="orders" className="mt-4 space-y-4">
                {ordersSection}
              </TabsContent>
            ) : null}
          </Tabs>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {printAction ? <ActionBar>{printAction}</ActionBar> : null}
      {canComplete ? <CompleteEncounter encounterId={encounter.id} onUpdated={onUpdated} /> : null}
      {vitalsSection}
      {assessmentSection}
      {planSection}
      {ordersSection}
    </div>
  );
}

function CompleteEncounter({ encounterId, onUpdated }: { encounterId: string; onUpdated: () => void }) {
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

  return (
    <>
      <ActionBar>
        <Button type="button" disabled={mutation.isPending} onClick={() => setConfirmOpen(true)}>
          {mutation.isPending ? "Completing…" : "Complete consultation"}
        </Button>
      </ActionBar>
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

function AddVitalsForm({
  encounterId,
  onUpdated,
  compact = false,
}: {
  encounterId: string;
  onUpdated: () => void;
  compact?: boolean;
}) {
  const { account } = useAuth();
  const queryClient = useQueryClient();
  const vitalUnitsQuery = useVitalUnits();
  const vitalUnits = vitalUnitsQuery.data ?? DEFAULT_VITAL_UNITS;
  const [values, setValues] = useState(EMPTY_VITAL_FORM_VALUES);
  const [error, setError] = useState<unknown>(null);

  function setFieldValue(field: VitalUnitFieldName, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function resetValues() {
    setValues(EMPTY_VITAL_FORM_VALUES);
  }

  const mutation = useMutation({
    mutationFn: async (body: Record<string, string | number>) => {
      requireOnlineMutation("vitals.record", isOnline());
      if (!isOnline()) {
        if (!account?.id) {
          throw new Error("Sign in is required.");
        }
        await queueVital({ userId: account.id, encounterId, measurements: body });
        return;
      }
      return api(`/encounters/${encounterId}/vitals/`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: async () => {
      resetValues();
      setError(null);
      toast.success(isOnline() ? "Vitals recorded." : "Vitals saved on this device and will sync when online.");
      await queryClient.invalidateQueries({ queryKey: ["encounters"] });
      onUpdated();
    },
    onError: (caught) => setError(caught),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const parsed = parseForm(vitalsSchema, values);
    if (!parsed.ok) {
      setError(validationError(formatZodError(parsed.error)));
      return;
    }
    mutation.mutate(buildVitalsBody(parsed.data));
  }

  return (
    <form
      className={cn("grid gap-3 rounded-lg border bg-card p-4", compact ? "grid-cols-2" : "md:grid-cols-3")}
      onSubmit={onSubmit}
    >
      <p className={cn("text-sm font-medium", compact ? "col-span-2" : "md:col-span-3")}>Record vitals</p>
      {vitalUnits.map((field) => (
        <div key={field.field} className="space-y-2">
          <Label htmlFor={field.field}>{vitalFieldLabel(field)}</Label>
          <Input
            id={field.field}
            inputMode={field.input_mode}
            value={values[field.field]}
            onChange={(event) => setFieldValue(field.field, event.target.value)}
          />
          <FormFieldError error={error} name={field.field} />
        </div>
      ))}
      <div className={cn("flex items-end", compact ? "col-span-2" : "md:col-span-3")}>
        <Button type="submit" size="sm" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save vitals"}
        </Button>
      </div>
      <div className={compact ? "col-span-2" : "md:col-span-3"}>
        <FormError error={error} />
      </div>
    </form>
  );
}

function AddNoteForm({ encounterId, onUpdated }: { encounterId: string; onUpdated: () => void }) {
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
    <form className="space-y-3 rounded-lg border bg-card p-4" onSubmit={onSubmit}>
      <p className="text-sm font-medium">Clinical note</p>
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
  medicine: string;
  medicineLabel: string;
  medicineUnit: string;
  quantity: string;
  dosage: string;
  frequency: string;
  durationDays: string;
};

const emptyDraftItem = (): PrescriptionDraftItem => ({
  medicine: "",
  medicineLabel: "",
  medicineUnit: "",
  quantity: "",
  dosage: "",
  frequency: "",
  durationDays: "",
});

function AddSymptomForm({ encounterId, onUpdated }: { encounterId: string; onUpdated: () => void }) {
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
    <form className="space-y-3 rounded-lg border bg-card p-4" onSubmit={onSubmit}>
      <p className="text-sm font-medium">Add symptom</p>
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

function AddDiagnosisForm({ encounterId, onUpdated }: { encounterId: string; onUpdated: () => void }) {
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
    <form className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-2" onSubmit={onSubmit}>
      <p className="text-sm font-medium md:col-span-2">Add diagnosis</p>
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

function AddTreatmentPlanForm({ encounterId, onUpdated }: { encounterId: string; onUpdated: () => void }) {
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
    <form className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-2" onSubmit={onSubmit}>
      <p className="text-sm font-medium md:col-span-2">Add treatment plan</p>
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

function AddFollowUpForm({ encounterId, onUpdated }: { encounterId: string; onUpdated: () => void }) {
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
    <form className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-2" onSubmit={onSubmit}>
      <p className="text-sm font-medium md:col-span-2">Schedule follow-up</p>
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
}: {
  encounterId: string;
  compact?: boolean;
}) {
  const router = useRouter();
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
            medicine: line.medicine,
            quantity: Number(line.quantity),
            dosage: line.dosage,
            frequency: line.frequency || undefined,
            duration_days: line.durationDays ? Number(line.durationDays) : undefined,
          }),
        });
      }
      return prescription;
    },
    onSuccess: async (prescription) => {
      setDraft(emptyDraftItem());
      setItems([]);
      setError(null);
      toast.success("Prescription created.");
      await queryClient.invalidateQueries({ queryKey: ["prescriptions"] });
      router.push(`/prescriptions/${prescription.id}`);
    },
    onError: (caught) => setError(caught),
  });

  function addLine() {
    setError(null);
    if (
      !validateForm(
        prescriptionItemSchema,
        {
          medicine: draft.medicine,
          quantity: draft.quantity,
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
        medicineLabel: labelFor(draft.medicine),
        medicineUnit: unitFor(draft.medicine),
      },
    ]);
    setDraft(emptyDraftItem());
  }

  function removeLine(index: number) {
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const lines = [...items];
    if (draft.medicine || draft.quantity || draft.dosage) {
      if (!draft.medicine || !draft.quantity || !draft.dosage) {
        setError(new Error("Complete the current line or clear it before creating."));
        return;
      }
      lines.push({
        ...draft,
        medicineLabel: draft.medicineLabel || labelFor(draft.medicine),
        medicineUnit: draft.medicineUnit || unitFor(draft.medicine),
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
      className={cn("min-w-0 space-y-4 rounded-lg border bg-card", compact ? "p-3" : "p-4")}
      onSubmit={onSubmit}
    >
      <p className="text-sm font-medium">Create prescription</p>
      <div className={cn("grid gap-3", compact ? "grid-cols-1" : "md:grid-cols-2")}>
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
              key={`${line.medicine}-${index}`}
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
                  line.medicineLabel || labelFor(line.medicine),
                  line.medicineUnit || unitFor(line.medicine),
                )}
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

function CreateLabOrderForm({ encounterId }: { encounterId: string }) {
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
    <form className="space-y-3 rounded-lg border bg-card p-4" onSubmit={onSubmit}>
      <p className="text-sm font-medium">Create lab order</p>
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
