"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { DoctorSelect, PatientSelect } from "@/components/entity-picker";
import { useResourceList } from "@/hooks/use-resource-list";
import { FormError, FormFieldError } from "@/components/form-field-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { allowed } from "@/features/access/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import { api, withQuery } from "@/lib/api/client";
import { ApiError, validationError } from "@/lib/api/errors";
import type { Invoice } from "@/lib/api/types";
import { manualInvoiceSchema, validateForm } from "@/lib/forms/schemas";
import { isOnline } from "@/offline/connectivity/network";
import { requireOnlineMutation } from "@/offline/sync/policy";

export function CreateManualInvoiceForm() {
  const router = useRouter();
  const { account, branchId } = useAuth();
  const queryClient = useQueryClient();
  const [patient, setPatient] = useState("");
  const [doctor, setDoctor] = useState("");
  const [error, setError] = useState<unknown>(null);

  const canCreate = Boolean(account && allowed(account.permissions, "billing.create"));
  const doctors = useResourceList<{ id: string }>(
    "doctor-profiles",
    withQuery("/doctor-profiles/", { page_size: "100", is_active: "true" }),
  );
  const readyToSubmit = Boolean(patient && doctor && branchId && !doctors.isLoading && (doctors.data?.length ?? 0) > 0);

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("invoices.create", isOnline());
      return api<Invoice>("/invoices/", {
        method: "POST",
        body: JSON.stringify({ patient, doctor }),
      });
    },
    onSuccess: async (invoice) => {
      setPatient("");
      setDoctor("");
      setError(null);
      toast.success("Draft invoice created.");
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
      router.push(`/billing/${invoice.id}`);
    },
    onError: (caught) => {
      if (caught instanceof ApiError && caught.fields.encounter) {
        setError(
          validationError({
            non_field_errors: [
              "Manual invoicing is not active on the server yet. Restart the backend, then try again.",
            ],
          }),
        );
        return;
      }
      setError(caught);
    },
  });

  if (!canCreate) {
    return null;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!branchId) {
      setError(validationError({ branch: ["Select a branch in the sidebar."] }));
      return;
    }
    if (!validateForm(manualInvoiceSchema, { patient, doctor }, setError)) {
      return;
    }
    mutation.mutate();
  }

  return (
    <Card className="shadow-premium-sm">
      <CardHeader>
        <CardTitle>Manual invoice</CardTitle>
        <CardDescription>
          Create a draft invoice for walk-ins or charges not tied to a consultation. Add line items after creating.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
          <PatientSelect id="manual_invoice_patient" value={patient} onValueChange={setPatient} />
          <DoctorSelect id="manual_invoice_doctor" value={doctor} onValueChange={setDoctor} />
          {!doctors.isLoading && (doctors.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground md:col-span-2">
              No doctors are available for this branch. Add a doctor under Staff first.
            </p>
          ) : null}
          <div className="md:col-span-2">
            <Button type="submit" disabled={mutation.isPending || !readyToSubmit}>
              {mutation.isPending ? "Creating…" : "Create draft invoice"}
            </Button>
          </div>
          <div className="md:col-span-2">
            <FormFieldError error={error} name="patient" />
            <FormFieldError error={error} name="doctor" />
            <FormFieldError error={error} name="branch" />
            <FormError error={error} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
