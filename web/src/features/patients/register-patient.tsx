"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { PatientBirthFields } from "@/features/patients/patient-birth-fields";
import { sexOptions } from "@/features/patients/contract";
import { api } from "@/lib/api/client";
import { FormError } from "@/components/form-field-error";
import { fieldMessages, validationError } from "@/lib/api/errors";
import { formatZodError, registerPatientSchema } from "@/lib/forms/schemas";
import type { Patient } from "@/lib/api/types";
import type { PatientBirthMode } from "@/lib/patients/age";
import { buildPatientDemographicsPayload } from "@/lib/patients/birth-schema";
import { isOnline } from "@/offline/connectivity/network";
import { requireOnlineMutation } from "@/offline/sync/policy";

export function RegisterPatient() {
  const { account } = useAuth();
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [birthMode, setBirthMode] = useState<PatientBirthMode>("dob");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState("");
  const [error, setError] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: (payload: Record<string, string | number>) => {
      requireOnlineMutation("patients.register", isOnline());
      return api<Patient>("/patients/", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async () => {
      setFullName("");
      setBirthMode("dob");
      setDateOfBirth("");
      setAge("");
      setSex("");
      setError(null);
      toast.success("Patient registered.");
      await queryClient.invalidateQueries({ queryKey: ["patients"] });
    },
    onError: (caught) => setError(caught),
  });

  if (!account || !allowed(account.permissions, "patients.create")) {
    return null;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const parsed = registerPatientSchema.safeParse({
      full_name: fullName,
      birth_mode: birthMode,
      date_of_birth: dateOfBirth,
      age,
      sex: sex || undefined,
    });
    if (!parsed.success) {
      setError(validationError(formatZodError(parsed.error)));
      return;
    }
    mutation.mutate(buildPatientDemographicsPayload(parsed.data));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Register a patient</CardTitle>
        <CardDescription>The server assigns the patient number and the clinic.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 md:grid-cols-3" onSubmit={onSubmit}>
          <div className="space-y-2 md:col-span-3">
            <Label htmlFor="full_name">Full name</Label>
            <Input id="full_name" value={fullName} required onChange={(event) => setFullName(event.target.value)} />
            <FieldError error={error} name="full_name" />
          </div>
          <div className="md:col-span-2">
            <PatientBirthFields
              idPrefix="register"
              mode={birthMode}
              onModeChange={setBirthMode}
              dateOfBirth={dateOfBirth}
              onDateOfBirthChange={setDateOfBirth}
              age={age}
              onAgeChange={setAge}
              error={error}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sex">Sex</Label>
            <Select value={sex} onValueChange={setSex}>
              <SelectTrigger id="sex" className="w-full">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {sexOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError error={error} name="sex" />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Register"}
            </Button>
          </div>
          <div className="md:col-span-3">
            <FormError error={error} />
          </div>
          <FieldError error={error} name="branch" />
        </form>
      </CardContent>
    </Card>
  );
}

function FieldError({ error, name }: { error: unknown; name: string }) {
  const messages = fieldMessages(error, name);
  if (messages.length === 0) {
    return null;
  }
  return (
    <p role="alert" className="text-sm text-destructive">
      {messages.join(" ")}
    </p>
  );
}
