"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

import { FormError, FormFieldError } from "@/components/form-field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api/client";
import type { ClinicDisabilityType, EncounterConsultationMeta } from "@/lib/api/types";
import { isOnline } from "@/offline/connectivity/network";
import { requireOnlineMutation } from "@/offline/sync/policy";

const REQUIRED_LABELS: Record<string, string> = {
  diagnosis: "Diagnosis",
  patient_status: "Patient status",
  treatment: "Treatment",
  remark: "Remark",
  referral_cause: "Cause of referral",
  disability_type: "Disability type",
};

function isRequired(required: string[], key: string) {
  return required.includes(key);
}

export function ConsultationCcrForm({
  encounterId,
  onUpdated,
}: {
  encounterId: string;
  onUpdated?: () => void;
}) {
  const queryClient = useQueryClient();
  const metaQuery = useQuery({
    queryKey: ["encounters", encounterId, "consultation-meta"],
    queryFn: () => api<EncounterConsultationMeta>(`/encounters/${encounterId}/consultation-meta/`),
  });
  const disabilityQuery = useQuery({
    queryKey: ["disability-types"],
    queryFn: async () => {
      const rows = await api<ClinicDisabilityType[]>("/disability-types/");
      return rows.filter((row) => row.is_active);
    },
  });

  const meta = metaQuery.data;
  const required = meta?.required_fields ?? [];
  const [patientStatus, setPatientStatus] = useState<"" | "new" | "old">("");
  const [isPlw, setIsPlw] = useState(false);
  const [isDisabled, setIsDisabled] = useState(false);
  const [disabilityType, setDisabilityType] = useState("");
  const [referralMade, setReferralMade] = useState(false);
  const [referralCause, setReferralCause] = useState("");
  const [treatment, setTreatment] = useState("");
  const [remark, setRemark] = useState("");
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!meta) {
      return;
    }
    setPatientStatus(meta.patient_status || meta.suggested_patient_status || "");
    setIsPlw(meta.is_plw);
    setIsDisabled(meta.is_disabled);
    setDisabilityType(meta.disability_type ?? "");
    setReferralMade(meta.referral_made);
    setReferralCause(meta.referral_cause);
    setTreatment(meta.treatment);
    setRemark(meta.remark);
  }, [meta]);

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => {
      requireOnlineMutation("encounters.consultation_meta", isOnline());
      return api<EncounterConsultationMeta>(`/encounters/${encounterId}/consultation-meta/`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },
    onSuccess: async () => {
      setError(null);
      toast.success("CCR fields saved.");
      await queryClient.invalidateQueries({ queryKey: ["encounters"] });
      await metaQuery.refetch();
      onUpdated?.();
    },
    onError: (caught) => setError(caught),
  });

  if (metaQuery.isLoading || !meta) {
    return <p className="text-sm text-muted-foreground">Loading register fields…</p>;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    mutation.mutate({
      patient_status: patientStatus || null,
      is_plw: isPlw,
      is_disabled: isDisabled,
      disability_type: isDisabled && disabilityType ? disabilityType : null,
      referral_made: referralMade,
      referral_cause: referralCause.trim(),
      treatment: treatment.trim(),
      remark: remark.trim(),
    });
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          Patient status (New / Old)
          {isRequired(required, "patient_status") ? " *" : ""}
        </legend>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="patient_status"
              checked={patientStatus === "new"}
              onChange={() => setPatientStatus("new")}
            />
            New
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="patient_status"
              checked={patientStatus === "old"}
              onChange={() => setPatientStatus("old")}
            />
            Old
          </label>
        </div>
        <FormFieldError error={error} name="patient_status" />
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          <input type="checkbox" checked={isPlw} onChange={(event) => setIsPlw(event.target.checked)} />
          PLW
        </label>
        <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={isDisabled}
            onChange={(event) => {
              setIsDisabled(event.target.checked);
              if (!event.target.checked) {
                setDisabilityType("");
              }
            }}
          />
          Disability (D)
        </label>
      </div>

      {isDisabled ? (
        <div className="space-y-2">
          <Label htmlFor="disability_type">
            Disability type
            {isRequired(required, "disability_type") ? " *" : ""}
          </Label>
          <Select value={disabilityType || undefined} onValueChange={setDisabilityType}>
            <SelectTrigger id="disability_type">
              <SelectValue placeholder="Select type…" />
            </SelectTrigger>
            <SelectContent>
              {(disabilityQuery.data ?? []).map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.sort_order}. {row.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormFieldError error={error} name="disability_type" />
        </div>
      ) : null}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Referral</legend>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="referral" checked={!referralMade} onChange={() => setReferralMade(false)} />
            No
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="referral" checked={referralMade} onChange={() => setReferralMade(true)} />
            Yes
          </label>
        </div>
        {referralMade ? (
          <div className="space-y-2">
            <Label htmlFor="referral_cause">
              Cause of referral
              {isRequired(required, "referral_cause") ? " *" : ""}
            </Label>
            <Input id="referral_cause" value={referralCause} onChange={(event) => setReferralCause(event.target.value)} />
            <FormFieldError error={error} name="referral_cause" />
          </div>
        ) : null}
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="ccr_treatment">
          Treatment
          {isRequired(required, "treatment") ? " *" : ""}
        </Label>
        <Input id="ccr_treatment" value={treatment} onChange={(event) => setTreatment(event.target.value)} />
        <FormFieldError error={error} name="treatment" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="ccr_remark">
          Remark
          {isRequired(required, "remark") ? " *" : ""}
        </Label>
        <textarea
          id="ccr_remark"
          rows={2}
          value={remark}
          onChange={(event) => setRemark(event.target.value)}
          className="flex min-h-16 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
        />
        <FormFieldError error={error} name="remark" />
      </div>

      {required.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Required before complete: {required.map((key) => REQUIRED_LABELS[key] ?? key).join(", ")}
        </p>
      ) : null}

      <Button type="submit" size="sm" disabled={mutation.isPending}>
        {mutation.isPending ? "Saving…" : "Save register fields"}
      </Button>
      <FormError error={error} />
    </form>
  );
}
