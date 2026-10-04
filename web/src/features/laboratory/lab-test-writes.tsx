"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

import { FormError, FormFieldError } from "@/components/form-field-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { allowed } from "@/features/access/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import { api } from "@/lib/api/client";
import type { LabTest } from "@/lib/api/types";
import { labTestCreateSchema, labTestEditSchema, validateForm } from "@/lib/forms/schemas";
import { isOnline } from "@/offline/connectivity/network";
import { requireOnlineMutation } from "@/offline/sync/policy";

export function CreateLabTestForm() {
  const { account } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [specimen, setSpecimen] = useState("");
  const [unit, setUnit] = useState("");
  const [referenceLow, setReferenceLow] = useState("");
  const [referenceHigh, setReferenceHigh] = useState("");
  const [referenceText, setReferenceText] = useState("");
  const [error, setError] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("lab_tests.create", isOnline());
      return api<LabTest>("/lab-tests/", {
        method: "POST",
        body: JSON.stringify({
          name,
          code,
          specimen,
          unit,
          reference_low: referenceLow || undefined,
          reference_high: referenceHigh || undefined,
          reference_text: referenceText || undefined,
        }),
      });
    },
    onSuccess: async () => {
      setName("");
      setCode("");
      setSpecimen("");
      setUnit("");
      setReferenceLow("");
      setReferenceHigh("");
      setReferenceText("");
      setError(null);
      toast.success("Lab test created.");
      await queryClient.invalidateQueries({ queryKey: ["lab-tests"] });
    },
    onError: (caught) => setError(caught),
  });

  if (!account || !allowed(account.permissions, "laboratory.manage")) {
    return null;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (
      !validateForm(
        labTestCreateSchema,
        {
          name,
          code,
          specimen,
          unit,
          reference_low: referenceLow,
          reference_high: referenceHigh,
          reference_text: referenceText,
        },
        setError,
      )
    ) {
      return;
    }
    mutation.mutate();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add lab test</CardTitle>
        <CardDescription>Create a test in the master catalog before ordering it.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="lab_test_name">Name</Label>
            <Input id="lab_test_name" value={name} required onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lab_test_code">Code</Label>
            <Input id="lab_test_code" value={code} required onChange={(event) => setCode(event.target.value)} />
            <FormFieldError error={error} name="code" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lab_test_specimen">Specimen</Label>
            <Input id="lab_test_specimen" value={specimen} required onChange={(event) => setSpecimen(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lab_test_unit">Unit</Label>
            <Input id="lab_test_unit" value={unit} required onChange={(event) => setUnit(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lab_test_ref_low">Reference low</Label>
            <Input id="lab_test_ref_low" value={referenceLow} onChange={(event) => setReferenceLow(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lab_test_ref_high">Reference high</Label>
            <Input id="lab_test_ref_high" value={referenceHigh} onChange={(event) => setReferenceHigh(event.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="lab_test_ref_text">Reference text</Label>
            <Input id="lab_test_ref_text" value={referenceText} onChange={(event) => setReferenceText(event.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Create lab test"}
            </Button>
          </div>
          <div className="md:col-span-2">
            <FormError error={error} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function EditLabTestForm({ test, onUpdated }: { test: LabTest; onUpdated: () => void }) {
  const { account } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState(test.name);
  const [specimen, setSpecimen] = useState(test.specimen);
  const [unit, setUnit] = useState(test.unit);
  const [referenceLow, setReferenceLow] = useState(test.reference_low ?? "");
  const [referenceHigh, setReferenceHigh] = useState(test.reference_high ?? "");
  const [referenceText, setReferenceText] = useState(test.reference_text ?? "");
  const [error, setError] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("lab_tests.update", isOnline());
      return api<LabTest>(`/lab-tests/${test.id}/`, {
        method: "PATCH",
        body: JSON.stringify({
          name,
          specimen,
          unit,
          reference_low: referenceLow || null,
          reference_high: referenceHigh || null,
          reference_text: referenceText || undefined,
        }),
      });
    },
    onSuccess: async () => {
      setError(null);
      toast.success("Lab test updated.");
      await queryClient.invalidateQueries({ queryKey: ["lab-tests"] });
      onUpdated();
    },
    onError: (caught) => setError(caught),
  });

  if (!account || !allowed(account.permissions, "laboratory.manage")) {
    return null;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (
      !validateForm(
        labTestEditSchema,
        {
          name,
          specimen,
          unit,
          reference_low: referenceLow,
          reference_high: referenceHigh,
          reference_text: referenceText,
        },
        setError,
      )
    ) {
      return;
    }
    mutation.mutate();
  }

  return (
    <form className="grid gap-4 rounded-lg border bg-card p-4 md:grid-cols-2" onSubmit={onSubmit}>
      <p className="text-sm font-medium md:col-span-2">Edit lab test · {test.code}</p>
      <div className="space-y-2">
        <Label htmlFor={`lab_edit_name_${test.id}`}>Name</Label>
        <Input id={`lab_edit_name_${test.id}`} value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`lab_edit_specimen_${test.id}`}>Specimen</Label>
        <Input id={`lab_edit_specimen_${test.id}`} value={specimen} onChange={(event) => setSpecimen(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`lab_edit_unit_${test.id}`}>Unit</Label>
        <Input id={`lab_edit_unit_${test.id}`} value={unit} onChange={(event) => setUnit(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`lab_edit_ref_low_${test.id}`}>Reference low</Label>
        <Input id={`lab_edit_ref_low_${test.id}`} value={referenceLow} onChange={(event) => setReferenceLow(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`lab_edit_ref_high_${test.id}`}>Reference high</Label>
        <Input id={`lab_edit_ref_high_${test.id}`} value={referenceHigh} onChange={(event) => setReferenceHigh(event.target.value)} />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor={`lab_edit_ref_text_${test.id}`}>Reference text</Label>
        <Input id={`lab_edit_ref_text_${test.id}`} value={referenceText} onChange={(event) => setReferenceText(event.target.value)} />
      </div>
      <div className="md:col-span-2">
        <Button type="submit" size="sm" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
      <div className="md:col-span-2">
        <FormError error={error} />
      </div>
    </form>
  );
}
