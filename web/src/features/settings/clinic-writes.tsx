"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

import { FormError } from "@/components/form-field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { allowed } from "@/features/access/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import { api } from "@/lib/api/client";
import type { Clinic } from "@/lib/api/types";
import { clinicUpdateSchema, validateForm } from "@/lib/forms/schemas";
import { isOnline } from "@/offline/connectivity/network";
import { requireOnlineMutation } from "@/offline/sync/policy";

export function EditClinicForm({ clinic, onUpdated }: { clinic: Clinic; onUpdated: () => void }) {
  const { account } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState(clinic.name);
  const [timezone, setTimezone] = useState(clinic.timezone);
  const [currency, setCurrency] = useState(clinic.currency);
  const [locale, setLocale] = useState(clinic.locale);
  const [error, setError] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("clinics.update", isOnline());
      return api<Clinic>(`/clinics/${clinic.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ name, timezone, currency, locale }),
      });
    },
    onSuccess: async () => {
      setError(null);
      toast.success("Clinic settings saved.");
      await queryClient.invalidateQueries({ queryKey: ["clinics"] });
      onUpdated();
    },
    onError: (caught) => setError(caught),
  });

  if (!account || !allowed(account.permissions, "clinics.manage")) {
    return null;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!validateForm(clinicUpdateSchema, { name, timezone, currency, locale }, setError)) {
      return;
    }
    mutation.mutate();
  }

  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="clinic_name">Name</Label>
        <Input id="clinic_name" value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="clinic_timezone">Timezone</Label>
        <Input id="clinic_timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="clinic_currency">Currency</Label>
        <Input id="clinic_currency" value={currency} onChange={(event) => setCurrency(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="clinic_locale">Locale</Label>
        <Input id="clinic_locale" value={locale} onChange={(event) => setLocale(event.target.value)} />
      </div>
      <div className="md:col-span-2">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save clinic settings"}
        </Button>
      </div>
      <div className="md:col-span-2">
        <FormError error={error} />
      </div>
    </form>
  );
}
