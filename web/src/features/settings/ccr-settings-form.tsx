"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

import { FormError } from "@/components/form-field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { allowed } from "@/features/access/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import { api } from "@/lib/api/client";
import type { ClinicCcrSettings, ClinicDisabilityType } from "@/lib/api/types";
import { isOnline } from "@/offline/connectivity/network";
import { requireOnlineMutation } from "@/offline/sync/policy";

const REQUIRED_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "diagnosis", label: "Diagnosis" },
  { value: "patient_status", label: "Patient status (Old/New)" },
  { value: "treatment", label: "Treatment" },
  { value: "remark", label: "Remark" },
  { value: "referral_cause", label: "Cause of referral (when referred)" },
  { value: "disability_type", label: "Disability type (when D selected)" },
];

export function CcrSettingsForm() {
  const { account } = useAuth();
  const queryClient = useQueryClient();
  const canManage = Boolean(account && allowed(account.permissions, "clinics.manage"));

  const settingsQuery = useQuery({
    queryKey: ["clinic-ccr-settings"],
    enabled: Boolean(account),
    queryFn: () => api<ClinicCcrSettings>("/clinic-ccr-settings/"),
  });
  const disabilityQuery = useQuery({
    queryKey: ["disability-types"],
    enabled: Boolean(account),
    queryFn: () => api<ClinicDisabilityType[]>("/disability-types/"),
  });

  const [projectName, setProjectName] = useState("");
  const [stateRegion, setStateRegion] = useState("");
  const [townshipMimu, setTownshipMimu] = useState("");
  const [villageMimu, setVillageMimu] = useState("");
  const [populationType, setPopulationType] = useState<"" | "host" | "idps">("");
  const [idpLocation, setIdpLocation] = useState<"" | "forest" | "monastery" | "school" | "other">("");
  const [consultantName, setConsultantName] = useState("");
  const [consultantPosition, setConsultantPosition] = useState("");
  const [requiredFields, setRequiredFields] = useState<string[]>([]);
  const [newDisabilityLabel, setNewDisabilityLabel] = useState("");
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    const settings = settingsQuery.data;
    if (!settings) {
      return;
    }
    setProjectName(settings.project_name);
    setStateRegion(settings.state_region);
    setTownshipMimu(settings.township_mimu);
    setVillageMimu(settings.village_mimu);
    setPopulationType(settings.population_type);
    setIdpLocation(settings.idp_location);
    setConsultantName(settings.consultant_name);
    setConsultantPosition(settings.consultant_position);
    setRequiredFields(settings.required_fields ?? []);
  }, [settingsQuery.data]);

  const saveSettings = useMutation({
    mutationFn: () => {
      requireOnlineMutation("clinics.ccr_settings", isOnline());
      return api<ClinicCcrSettings>("/clinic-ccr-settings/", {
        method: "PATCH",
        body: JSON.stringify({
          project_name: projectName,
          state_region: stateRegion,
          township_mimu: townshipMimu,
          village_mimu: villageMimu,
          population_type: populationType,
          idp_location: idpLocation,
          consultant_name: consultantName,
          consultant_position: consultantPosition,
          required_fields: requiredFields,
        }),
      });
    },
    onSuccess: async () => {
      setError(null);
      toast.success("CCR settings saved.");
      await queryClient.invalidateQueries({ queryKey: ["clinic-ccr-settings"] });
    },
    onError: (caught) => setError(caught),
  });

  const addDisabilityType = useMutation({
    mutationFn: (label: string) => {
      requireOnlineMutation("clinics.disability_type", isOnline());
      const rows = disabilityQuery.data ?? [];
      return api<ClinicDisabilityType>("/disability-types/", {
        method: "POST",
        body: JSON.stringify({ label, sort_order: rows.length + 1, is_active: true }),
      });
    },
    onSuccess: async () => {
      setNewDisabilityLabel("");
      await queryClient.invalidateQueries({ queryKey: ["disability-types"] });
    },
  });

  const toggleDisabilityType = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api<ClinicDisabilityType>(`/disability-types/${id}/`, {
        method: "PATCH",
        body: JSON.stringify({ is_active }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["disability-types"] });
    },
  });

  if (!account) {
    return null;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) {
      return;
    }
    setError(null);
    saveSettings.mutate();
  }

  function toggleRequired(value: string) {
    setRequiredFields((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  }

  return (
    <div className="space-y-6">
      <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
        <div className="md:col-span-2">
          <p className="text-sm font-medium">CCR report header</p>
          <p className="text-xs text-muted-foreground">Printed on Excel and PDF consultation registers.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ccr_project_name">Project name</Label>
          <Input id="ccr_project_name" value={projectName} disabled={!canManage} onChange={(e) => setProjectName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ccr_state_region">State/Region</Label>
          <Input id="ccr_state_region" value={stateRegion} disabled={!canManage} onChange={(e) => setStateRegion(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ccr_township">Township (MIMU)</Label>
          <Input id="ccr_township" value={townshipMimu} disabled={!canManage} onChange={(e) => setTownshipMimu(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ccr_village">Village name (MIMU)</Label>
          <Input id="ccr_village" value={villageMimu} disabled={!canManage} onChange={(e) => setVillageMimu(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ccr_population">Types</Label>
          <select
            id="ccr_population"
            disabled={!canManage}
            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            value={populationType}
            onChange={(e) => setPopulationType(e.target.value as "" | "host" | "idps")}
          >
            <option value="">Not set</option>
            <option value="host">Host</option>
            <option value="idps">IDPs</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ccr_idp_location">IDP location</Label>
          <select
            id="ccr_idp_location"
            disabled={!canManage}
            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            value={idpLocation}
            onChange={(e) => setIdpLocation(e.target.value as typeof idpLocation)}
          >
            <option value="">Not set</option>
            <option value="forest">Forest</option>
            <option value="monastery">Monastery</option>
            <option value="school">School</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ccr_consultant_name">Consultant name</Label>
          <Input id="ccr_consultant_name" value={consultantName} disabled={!canManage} onChange={(e) => setConsultantName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ccr_consultant_position">Position</Label>
          <Input id="ccr_consultant_position" value={consultantPosition} disabled={!canManage} onChange={(e) => setConsultantPosition(e.target.value)} />
        </div>

        <div className="md:col-span-2 space-y-2">
          <Label>Required consultation fields</Label>
          <div className="flex flex-wrap gap-3">
            {REQUIRED_OPTIONS.map((option) => (
              <label key={option.value} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  disabled={!canManage}
                  checked={requiredFields.includes(option.value)}
                  onChange={() => toggleRequired(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>

        {canManage ? (
          <div className="md:col-span-2">
            <Button type="submit" disabled={saveSettings.isPending}>
              {saveSettings.isPending ? "Saving…" : "Save CCR settings"}
            </Button>
          </div>
        ) : (
          <p className="md:col-span-2 text-sm text-muted-foreground">CCR settings are read-only for this account.</p>
        )}
        <div className="md:col-span-2">
          <FormError error={error} />
        </div>
      </form>

      <div className="space-y-3 rounded-lg border p-4">
        <p className="text-sm font-medium">Disability types</p>
        <ul className="space-y-2 text-sm">
          {(disabilityQuery.data ?? []).map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3">
              <span className={row.is_active ? undefined : "text-muted-foreground line-through"}>
                {row.sort_order}. {row.label}
              </span>
              {canManage ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => toggleDisabilityType.mutate({ id: row.id, is_active: !row.is_active })}
                >
                  {row.is_active ? "Deactivate" : "Activate"}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="New disability type label"
              value={newDisabilityLabel}
              onChange={(event) => setNewDisabilityLabel(event.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              disabled={!newDisabilityLabel.trim() || addDisabilityType.isPending}
              onClick={() => addDisabilityType.mutate(newDisabilityLabel.trim())}
            >
              Add type
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
