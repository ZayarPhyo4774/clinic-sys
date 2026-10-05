"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

import { VitalsGridForm } from "@/components/vitals/vitals-grid";
import { FormError } from "@/components/form-field-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/features/auth/auth-provider";
import { useVitalUnits } from "@/hooks/use-vital-units";
import { api } from "@/lib/api/client";
import { validationError } from "@/lib/api/errors";
import { formatZodError } from "@/lib/forms/schemas";
import type { VitalUnitFieldName } from "@/lib/api/types";
import { DEFAULT_VITAL_UNITS, EMPTY_VITAL_FORM_VALUES } from "@/lib/vitals/units";
import { buildVitalsApiBody, parseVitalsForm } from "@/lib/vitals/validation";
import { patchQueueEntry, refreshQueueQueries } from "@/features/queue/queue-cache";
import { queueVital } from "@/offline/repositories/clinical-repository";
import { isOnline } from "@/offline/connectivity/network";
import { requireOnlineMutation } from "@/offline/sync/policy";
import { cn } from "@/lib/utils";

function hasAnyValue(values: Record<VitalUnitFieldName, string>) {
  return Object.values(values).some((value) => value.trim().length > 0);
}

export function VitalsForm({
  encounterId,
  queueEntryId,
  onSaved,
  compact = false,
}: {
  encounterId: string;
  queueEntryId?: string;
  onSaved?: () => void;
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
      if (queueEntryId) {
        patchQueueEntry(queryClient, queueEntryId, {
          vitals_recorded_at: new Date().toISOString(),
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["encounters"] });
      await refreshQueueQueries(queryClient);
      onSaved?.();
    },
    onError: (caught) => setError(caught),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const parsed = parseVitalsForm(values, vitalUnits);
    if (!parsed.ok) {
      setError(validationError(formatZodError(parsed.error)));
      return;
    }
    mutation.mutate(buildVitalsApiBody(parsed.data, vitalUnits));
  }

  const unitHint = vitalUnits
    .filter((field) => ["temperature", "weight_kg", "height_cm"].includes(field.field))
    .map((field) => `${field.short_label}: ${field.unit}`)
    .join(" · ");

  return (
    <Card className={cn("shadow-premium-sm", compact && "border-dashed")}>
      <CardHeader className={cn(compact && "pb-3")}>
        <CardTitle className="text-base">Vital signs</CardTitle>
        <CardDescription>
          Same grid as the consultation chart. Fill what you measured — leave the rest blank.
          {unitHint ? ` Units: ${unitHint}.` : null}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          <VitalsGridForm values={values} onChange={setFieldValue} fields={vitalUnits} error={error} />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" disabled={mutation.isPending || !hasAnyValue(values)}>
              {mutation.isPending ? "Saving…" : "Save vitals"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={mutation.isPending || !hasAnyValue(values)}
              onClick={() => {
                resetValues();
                setError(null);
              }}
            >
              Clear
            </Button>
            <FormError error={error} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
