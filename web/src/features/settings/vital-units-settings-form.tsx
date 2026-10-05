"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

import { FormError } from "@/components/form-field-error";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { allowed } from "@/features/access/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import { api } from "@/lib/api/client";
import type { ClinicVitalSettings, VitalUnitFieldName } from "@/lib/api/types";
import { DEFAULT_VITAL_UNITS } from "@/lib/vitals/units";
import { isOnline } from "@/offline/connectivity/network";
import { requireOnlineMutation } from "@/offline/sync/policy";

const CONFIGURABLE_FIELDS: VitalUnitFieldName[] = ["temperature", "weight_kg", "height_cm"];

export function VitalUnitsSettingsForm() {
  const { account } = useAuth();
  const queryClient = useQueryClient();
  const canManage = Boolean(account && allowed(account.permissions, "clinics.manage"));

  const settingsQuery = useQuery({
    queryKey: ["clinic-vital-settings"],
    enabled: Boolean(account),
    queryFn: () => api<ClinicVitalSettings>("/clinic-vital-settings/"),
  });

  const [units, setUnits] = useState<Partial<Record<VitalUnitFieldName, string>>>({});
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!settingsQuery.data) {
      return;
    }
    setUnits(settingsQuery.data.units ?? {});
  }, [settingsQuery.data]);

  const saveSettings = useMutation({
    mutationFn: () => {
      requireOnlineMutation("clinics.vital_settings", isOnline());
      const configured = CONFIGURABLE_FIELDS.reduce<Partial<Record<VitalUnitFieldName, string>>>((acc, field) => {
        const selected = units[field];
        const defaultUnit = settingsQuery.data?.defaults[field] ?? DEFAULT_VITAL_UNITS.find((row) => row.field === field)?.unit;
        if (selected && defaultUnit && selected !== defaultUnit) {
          acc[field] = selected;
        }
        return acc;
      }, {});
      return api<ClinicVitalSettings>("/clinic-vital-settings/", {
        method: "PATCH",
        body: JSON.stringify({ units: configured }),
      });
    },
    onSuccess: async () => {
      setError(null);
      toast.success("Vital units saved.");
      await queryClient.invalidateQueries({ queryKey: ["clinic-vital-settings"] });
      await queryClient.invalidateQueries({ queryKey: ["vital-units"] });
    },
    onError: (caught) => setError(caught),
  });

  if (settingsQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading vital unit settings…</p>;
  }

  const options = settingsQuery.data?.options ?? {};
  const labels = Object.fromEntries(DEFAULT_VITAL_UNITS.map((row) => [row.field, row.label])) as Record<
    VitalUnitFieldName,
    string
  >;

  return (
    <form
      className="space-y-4"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        saveSettings.mutate();
      }}
    >
      <p className="text-sm text-muted-foreground">
        Choose display units for triage and consultation vitals. Values are stored in standard units and converted
        automatically.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CONFIGURABLE_FIELDS.map((field) => {
          const choices = options[field] ?? [units[field] ?? "—"];
          return (
            <div key={field} className="space-y-2">
              <Label htmlFor={`vital-unit-${field}`}>{labels[field] ?? field}</Label>
              <Select
                value={units[field] ?? choices[0]}
                onValueChange={(value) => setUnits((current) => ({ ...current, [field]: value }))}
                disabled={!canManage}
              >
                <SelectTrigger id={`vital-unit-${field}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {choices.map((choice) => (
                    <SelectItem key={choice} value={choice}>
                      {choice}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>
      <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        Pulse, respiratory rate, SpO₂, and blood pressure use fixed units (bpm, /min, %, mmHg).
      </div>
      {canManage ? (
        <Button type="submit" disabled={saveSettings.isPending}>
          {saveSettings.isPending ? "Saving…" : "Save vital units"}
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">Clinic manage permission is required to change vital units.</p>
      )}
      <FormError error={error} />
    </form>
  );
}
