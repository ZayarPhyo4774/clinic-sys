"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ActionBar } from "@/components/action-bar";
import { ConfirmDialog } from "@/components/confirm-dialog";
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
import { allowed } from "@/features/access/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import {
  allergySeverityOptions,
  contactKindOptions,
  documentTypeOptions,
  sexOptions,
} from "@/features/patients/contract";
import { api } from "@/lib/api/client";
import type { Patient, PatientProfile } from "@/lib/api/types";
import {
  addressEditSchema,
  addressSchema,
  allergyCorrectSchema,
  allergySchema,
  contactEditSchema,
  contactSchema,
  documentCreateSchema,
  documentEditSchema,
  historyCorrectSchema,
  historySchema,
  patientDemographicsSchema,
  validateForm,
} from "@/lib/forms/schemas";
import { isOnline } from "@/offline/connectivity/network";
import { requireOnlineMutation } from "@/offline/sync/policy";

export function PatientWritePanel({
  profile,
  onUpdated,
}: {
  profile: PatientProfile;
  onUpdated: () => void;
}) {
  const { account } = useAuth();
  const canUpdate = Boolean(account && allowed(account.permissions, "patients.update"));
  const canWriteSubresources = Boolean(
    account && (allowed(account.permissions, "patients.create") || allowed(account.permissions, "patients.update")),
  );
  const canDelete = Boolean(account && allowed(account.permissions, "patients.delete"));

  if (!canUpdate && !canWriteSubresources && !canDelete) {
    return null;
  }

  const patientId = profile.patient.id;

  return (
    <div className="space-y-6">
      {canUpdate ? (
        <EditDemographicsForm
          key={`${profile.patient.id}-${profile.patient.version}`}
          patient={profile.patient}
          onUpdated={onUpdated}
        />
      ) : null}
      {canDelete && profile.patient.is_active ? (
        <DeactivatePatientButton patientId={patientId} onUpdated={onUpdated} />
      ) : null}
      {canUpdate ? (
        <>
          <EditContactForm patientId={patientId} contacts={profile.contacts} onUpdated={onUpdated} />
          <EditAddressForm patientId={patientId} addresses={profile.addresses} onUpdated={onUpdated} />
          <EditDocumentForm patientId={patientId} documents={profile.documents} onUpdated={onUpdated} />
        </>
      ) : null}
      {canWriteSubresources ? (
        <>
          <AddContactForm patientId={patientId} onUpdated={onUpdated} />
          <AddAddressForm patientId={patientId} onUpdated={onUpdated} />
          <AddAllergyForm patientId={patientId} onUpdated={onUpdated} />
          <CorrectAllergyForm patientId={patientId} allergies={profile.allergies} onUpdated={onUpdated} />
          <AddHistoryForm patientId={patientId} onUpdated={onUpdated} />
          <CorrectHistoryForm patientId={patientId} history={profile.medical_history} onUpdated={onUpdated} />
          <AddDocumentForm patientId={patientId} onUpdated={onUpdated} />
        </>
      ) : null}
    </div>
  );
}

function EditDemographicsForm({ patient, onUpdated }: { patient: Patient; onUpdated: () => void }) {
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState(patient.full_name);
  const [dateOfBirth, setDateOfBirth] = useState(patient.date_of_birth);
  const [sex, setSex] = useState(patient.sex);
  const [error, setError] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("patients.update", isOnline());
      return api<Patient>(`/patients/${patient.id}/`, {
        method: "PATCH",
        body: JSON.stringify({
          full_name: fullName,
          date_of_birth: dateOfBirth,
          sex,
          version: patient.version,
        }),
      });
    },
    onSuccess: async () => {
      setError(null);
      toast.success("Patient updated.");
      await queryClient.invalidateQueries({ queryKey: ["patients"] });
      onUpdated();
    },
    onError: (caught) => setError(caught),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!validateForm(patientDemographicsSchema, { full_name: fullName, date_of_birth: dateOfBirth, sex }, setError)) {
      return;
    }
    mutation.mutate();
  }

  return (
    <form className="grid gap-4 rounded-lg border bg-card p-4 md:grid-cols-2" onSubmit={onSubmit}>
      <p className="text-sm font-medium md:col-span-2">Edit demographics</p>
      <div className="space-y-2">
        <Label htmlFor="edit_full_name">Full name</Label>
        <Input id="edit_full_name" value={fullName} onChange={(event) => setFullName(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit_dob">Date of birth</Label>
        <Input id="edit_dob" type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit_sex">Sex</Label>
        <Select value={sex} onValueChange={setSex}>
          <SelectTrigger id="edit_sex" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sexOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="md:col-span-2">
        <Button type="submit" size="sm" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save demographics"}
        </Button>
      </div>
      <div className="md:col-span-2">
        <FormFieldError error={error} name="version" />
        <FormFieldError error={error} name="full_name" />
        <FormError error={error} />
      </div>
    </form>
  );
}

function DeactivatePatientButton({ patientId, onUpdated }: { patientId: string; onUpdated: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("patients.deactivate", isOnline());
      return api(`/patients/${patientId}/`, { method: "DELETE" });
    },
    onSuccess: async () => {
      setOpen(false);
      toast.success("Patient deactivated.");
      await queryClient.invalidateQueries({ queryKey: ["patients"] });
      onUpdated();
      router.push("/patients");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "The patient could not be deactivated.");
    },
  });

  return (
    <>
      <ActionBar>
        <Button type="button" variant="outline" onClick={() => setOpen(true)}>
          Deactivate patient
        </Button>
      </ActionBar>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Deactivate this patient?"
        description="The record stays in the system but is marked inactive."
        confirmLabel="Deactivate"
        destructive
        pending={mutation.isPending}
        onConfirm={() => mutation.mutate()}
      />
    </>
  );
}

function AddContactForm({ patientId, onUpdated }: { patientId: string; onUpdated: () => void }) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState("phone");
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("patients.contact_create", isOnline());
      return api(`/patients/${patientId}/contacts/`, {
        method: "POST",
        body: JSON.stringify({ kind, name: name || undefined, value, is_primary: isPrimary }),
      });
    },
    onSuccess: async () => {
      setName("");
      setValue("");
      setIsPrimary(false);
      setError(null);
      toast.success("Contact added.");
      await queryClient.invalidateQueries({ queryKey: ["patients"] });
      onUpdated();
    },
    onError: (caught) => setError(caught),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!validateForm(contactSchema, { kind, value, is_primary: isPrimary }, setError)) {
      return;
    }
    mutation.mutate();
  }

  return (
    <form className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-2" onSubmit={onSubmit}>
      <p className="text-sm font-medium md:col-span-2">Add contact</p>
      <div className="space-y-2">
        <Label htmlFor={`contact_kind_${patientId}`}>Kind</Label>
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger id={`contact_kind_${patientId}`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {contactKindOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`contact_name_${patientId}`}>Name</Label>
        <Input id={`contact_name_${patientId}`} value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`contact_value_${patientId}`}>Value</Label>
        <Input id={`contact_value_${patientId}`} value={value} onChange={(event) => setValue(event.target.value)} />
        <FormFieldError error={error} name="value" />
      </div>
      <div className="flex items-end">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isPrimary} onChange={(event) => setIsPrimary(event.target.checked)} />
          Primary contact
        </label>
      </div>
      <div className="md:col-span-2">
        <Button type="submit" size="sm" disabled={mutation.isPending}>
          {mutation.isPending ? "Adding…" : "Add contact"}
        </Button>
      </div>
      <div className="md:col-span-2">
        <FormFieldError error={error} name="name" />
        <FormError error={error} />
      </div>
    </form>
  );
}

function AddAddressForm({ patientId, onUpdated }: { patientId: string; onUpdated: () => void }) {
  const queryClient = useQueryClient();
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("patients.address_create", isOnline());
      return api(`/patients/${patientId}/addresses/`, {
        method: "POST",
        body: JSON.stringify({
          line1,
          line2: line2 || undefined,
          city,
          region: region || undefined,
          postal_code: postalCode || undefined,
          country,
          is_primary: isPrimary,
        }),
      });
    },
    onSuccess: async () => {
      setLine1("");
      setLine2("");
      setCity("");
      setRegion("");
      setPostalCode("");
      setCountry("");
      setIsPrimary(false);
      setError(null);
      toast.success("Address added.");
      await queryClient.invalidateQueries({ queryKey: ["patients"] });
      onUpdated();
    },
    onError: (caught) => setError(caught),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (
      !validateForm(
        addressSchema,
        { line1, line2, city, region, postal_code: postalCode, country },
        setError,
      )
    ) {
      return;
    }
    mutation.mutate();
  }

  return (
    <form className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-2" onSubmit={onSubmit}>
      <p className="text-sm font-medium md:col-span-2">Add address</p>
      <div className="space-y-2">
        <Label htmlFor={`addr_line1_${patientId}`}>Line 1</Label>
        <Input id={`addr_line1_${patientId}`} value={line1} onChange={(event) => setLine1(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`addr_line2_${patientId}`}>Line 2</Label>
        <Input id={`addr_line2_${patientId}`} value={line2} onChange={(event) => setLine2(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`addr_city_${patientId}`}>City</Label>
        <Input id={`addr_city_${patientId}`} value={city} onChange={(event) => setCity(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`addr_region_${patientId}`}>Region</Label>
        <Input id={`addr_region_${patientId}`} value={region} onChange={(event) => setRegion(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`addr_postal_${patientId}`}>Postal code</Label>
        <Input id={`addr_postal_${patientId}`} value={postalCode} onChange={(event) => setPostalCode(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`addr_country_${patientId}`}>Country</Label>
        <Input id={`addr_country_${patientId}`} value={country} onChange={(event) => setCountry(event.target.value)} />
      </div>
      <div className="flex items-end">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isPrimary} onChange={(event) => setIsPrimary(event.target.checked)} />
          Primary address
        </label>
      </div>
      <div className="md:col-span-2">
        <Button type="submit" size="sm" disabled={mutation.isPending}>
          {mutation.isPending ? "Adding…" : "Add address"}
        </Button>
      </div>
      <div className="md:col-span-2">
        <FormFieldError error={error} name="line1" />
        <FormError error={error} />
      </div>
    </form>
  );
}

function AddAllergyForm({ patientId, onUpdated }: { patientId: string; onUpdated: () => void }) {
  const queryClient = useQueryClient();
  const [substance, setSubstance] = useState("");
  const [reaction, setReaction] = useState("");
  const [severity, setSeverity] = useState("unknown");
  const [error, setError] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("patients.allergy_create", isOnline());
      return api(`/patients/${patientId}/allergies/`, {
        method: "POST",
        body: JSON.stringify({
          substance,
          reaction: reaction || undefined,
          severity,
        }),
      });
    },
    onSuccess: async () => {
      setSubstance("");
      setReaction("");
      setSeverity("unknown");
      setError(null);
      toast.success("Allergy recorded.");
      await queryClient.invalidateQueries({ queryKey: ["patients"] });
      onUpdated();
    },
    onError: (caught) => setError(caught),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!validateForm(allergySchema, { substance, reaction, severity }, setError)) {
      return;
    }
    mutation.mutate();
  }

  return (
    <form className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-2" onSubmit={onSubmit}>
      <p className="text-sm font-medium md:col-span-2">Add allergy</p>
      <div className="space-y-2">
        <Label htmlFor={`allergy_substance_${patientId}`}>Substance</Label>
        <Input
          id={`allergy_substance_${patientId}`}
          value={substance}
          onChange={(event) => setSubstance(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`allergy_reaction_${patientId}`}>Reaction</Label>
        <Input id={`allergy_reaction_${patientId}`} value={reaction} onChange={(event) => setReaction(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`allergy_severity_${patientId}`}>Severity</Label>
        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger id={`allergy_severity_${patientId}`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {allergySeverityOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="md:col-span-2">
        <Button type="submit" size="sm" disabled={mutation.isPending}>
          {mutation.isPending ? "Adding…" : "Add allergy"}
        </Button>
      </div>
      <div className="md:col-span-2">
        <FormFieldError error={error} name="substance" />
        <FormError error={error} />
      </div>
    </form>
  );
}

function CorrectAllergyForm({
  patientId,
  allergies,
  onUpdated,
}: {
  patientId: string;
  allergies: PatientProfile["allergies"];
  onUpdated: () => void;
}) {
  const queryClient = useQueryClient();
  const active = allergies.filter((row) => row.status === "active");
  const [supersedes, setSupersedes] = useState("");
  const [substance, setSubstance] = useState("");
  const [reaction, setReaction] = useState("");
  const [severity, setSeverity] = useState("unknown");
  const [error, setError] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("patients.allergy_correct", isOnline());
      return api(`/patients/${patientId}/allergies/`, {
        method: "POST",
        body: JSON.stringify({
          supersedes,
          substance,
          reaction: reaction || undefined,
          severity,
        }),
      });
    },
    onSuccess: async () => {
      setSupersedes("");
      setSubstance("");
      setReaction("");
      setSeverity("unknown");
      setError(null);
      toast.success("Allergy corrected.");
      await queryClient.invalidateQueries({ queryKey: ["patients"] });
      onUpdated();
    },
    onError: (caught) => setError(caught),
  });

  if (active.length === 0) {
    return null;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!validateForm(allergyCorrectSchema, { supersedes, substance, reaction, severity }, setError)) {
      return;
    }
    mutation.mutate();
  }

  return (
    <form className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-2" onSubmit={onSubmit}>
      <p className="text-sm font-medium md:col-span-2">Correct allergy</p>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor={`allergy_supersedes_${patientId}`}>Replace</Label>
        <Select value={supersedes} onValueChange={setSupersedes}>
          <SelectTrigger id={`allergy_supersedes_${patientId}`} className="w-full">
            <SelectValue placeholder="Select active allergy" />
          </SelectTrigger>
          <SelectContent>
            {active.map((row) => (
              <SelectItem key={row.id} value={row.id}>
                {row.substance} ({row.severity})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`allergy_correct_substance_${patientId}`}>New substance</Label>
        <Input
          id={`allergy_correct_substance_${patientId}`}
          value={substance}
          onChange={(event) => setSubstance(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`allergy_correct_reaction_${patientId}`}>New reaction</Label>
        <Input
          id={`allergy_correct_reaction_${patientId}`}
          value={reaction}
          onChange={(event) => setReaction(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`allergy_correct_severity_${patientId}`}>Severity</Label>
        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger id={`allergy_correct_severity_${patientId}`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {allergySeverityOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="md:col-span-2">
        <Button type="submit" size="sm" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Correct allergy"}
        </Button>
      </div>
      <div className="md:col-span-2">
        <FormFieldError error={error} name="supersedes" />
        <FormError error={error} />
      </div>
    </form>
  );
}

function AddHistoryForm({ patientId, onUpdated }: { patientId: string; onUpdated: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [onsetDate, setOnsetDate] = useState("");
  const [error, setError] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("patients.history_create", isOnline());
      return api(`/patients/${patientId}/medical-history/`, {
        method: "POST",
        body: JSON.stringify({
          title,
          details: details || undefined,
          onset_date: onsetDate || undefined,
        }),
      });
    },
    onSuccess: async () => {
      setTitle("");
      setDetails("");
      setOnsetDate("");
      setError(null);
      toast.success("Medical history recorded.");
      await queryClient.invalidateQueries({ queryKey: ["patients"] });
      onUpdated();
    },
    onError: (caught) => setError(caught),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!validateForm(historySchema, { title, details }, setError)) {
      return;
    }
    mutation.mutate();
  }

  return (
    <form className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-2" onSubmit={onSubmit}>
      <p className="text-sm font-medium md:col-span-2">Add medical history</p>
      <div className="space-y-2">
        <Label htmlFor={`history_title_${patientId}`}>Title</Label>
        <Input id={`history_title_${patientId}`} value={title} onChange={(event) => setTitle(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`history_onset_${patientId}`}>Onset date</Label>
        <Input id={`history_onset_${patientId}`} type="date" value={onsetDate} onChange={(event) => setOnsetDate(event.target.value)} />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor={`history_details_${patientId}`}>Details</Label>
        <Input id={`history_details_${patientId}`} value={details} onChange={(event) => setDetails(event.target.value)} />
      </div>
      <div className="md:col-span-2">
        <Button type="submit" size="sm" disabled={mutation.isPending}>
          {mutation.isPending ? "Adding…" : "Add history entry"}
        </Button>
      </div>
      <div className="md:col-span-2">
        <FormFieldError error={error} name="title" />
        <FormError error={error} />
      </div>
    </form>
  );
}

function CorrectHistoryForm({
  patientId,
  history,
  onUpdated,
}: {
  patientId: string;
  history: PatientProfile["medical_history"];
  onUpdated: () => void;
}) {
  const queryClient = useQueryClient();
  const active = history.filter((row) => row.status === "active");
  const [supersedes, setSupersedes] = useState("");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [onsetDate, setOnsetDate] = useState("");
  const [error, setError] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("patients.history_correct", isOnline());
      return api(`/patients/${patientId}/medical-history/`, {
        method: "POST",
        body: JSON.stringify({
          supersedes,
          title,
          details: details || undefined,
          onset_date: onsetDate || undefined,
        }),
      });
    },
    onSuccess: async () => {
      setSupersedes("");
      setTitle("");
      setDetails("");
      setOnsetDate("");
      setError(null);
      toast.success("History entry corrected.");
      await queryClient.invalidateQueries({ queryKey: ["patients"] });
      onUpdated();
    },
    onError: (caught) => setError(caught),
  });

  if (active.length === 0) {
    return null;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!validateForm(historyCorrectSchema, { supersedes, title, details }, setError)) {
      return;
    }
    mutation.mutate();
  }

  return (
    <form className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-2" onSubmit={onSubmit}>
      <p className="text-sm font-medium md:col-span-2">Correct medical history</p>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor={`history_supersedes_${patientId}`}>Replace</Label>
        <Select value={supersedes} onValueChange={setSupersedes}>
          <SelectTrigger id={`history_supersedes_${patientId}`} className="w-full">
            <SelectValue placeholder="Select active entry" />
          </SelectTrigger>
          <SelectContent>
            {active.map((row) => (
              <SelectItem key={row.id} value={row.id}>
                {row.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`history_correct_title_${patientId}`}>New title</Label>
        <Input
          id={`history_correct_title_${patientId}`}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`history_correct_onset_${patientId}`}>Onset date</Label>
        <Input
          id={`history_correct_onset_${patientId}`}
          type="date"
          value={onsetDate}
          onChange={(event) => setOnsetDate(event.target.value)}
        />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor={`history_correct_details_${patientId}`}>Details</Label>
        <Input
          id={`history_correct_details_${patientId}`}
          value={details}
          onChange={(event) => setDetails(event.target.value)}
        />
      </div>
      <div className="md:col-span-2">
        <Button type="submit" size="sm" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Correct history entry"}
        </Button>
      </div>
      <div className="md:col-span-2">
        <FormFieldError error={error} name="supersedes" />
        <FormError error={error} />
      </div>
    </form>
  );
}

function AddDocumentForm({ patientId, onUpdated }: { patientId: string; onUpdated: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [documentType, setDocumentType] = useState("other");
  const [fileName, setFileName] = useState("");
  const [contentType, setContentType] = useState("application/pdf");
  const [byteSize, setByteSize] = useState("");
  const [storageKey, setStorageKey] = useState("");
  const [error, setError] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("patients.document_create", isOnline());
      return api(`/patients/${patientId}/documents/`, {
        method: "POST",
        body: JSON.stringify({
          title,
          document_type: documentType,
          file_name: fileName,
          content_type: contentType,
          byte_size: byteSize ? Number(byteSize) : undefined,
          storage_key: storageKey,
        }),
      });
    },
    onSuccess: async () => {
      setTitle("");
      setDocumentType("other");
      setFileName("");
      setContentType("application/pdf");
      setByteSize("");
      setStorageKey("");
      setError(null);
      toast.success("Document metadata recorded.");
      await queryClient.invalidateQueries({ queryKey: ["patients"] });
      onUpdated();
    },
    onError: (caught) => setError(caught),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (
      !validateForm(
        documentCreateSchema,
        { title, document_type: documentType, file_name: fileName, storage_key: storageKey },
        setError,
      )
    ) {
      return;
    }
    mutation.mutate();
  }

  return (
    <form className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-2" onSubmit={onSubmit}>
      <p className="text-sm font-medium md:col-span-2">Add document metadata</p>
      <div className="space-y-2">
        <Label htmlFor={`doc_title_${patientId}`}>Title</Label>
        <Input id={`doc_title_${patientId}`} value={title} onChange={(event) => setTitle(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`doc_type_${patientId}`}>Type</Label>
        <Select value={documentType} onValueChange={setDocumentType}>
          <SelectTrigger id={`doc_type_${patientId}`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {documentTypeOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`doc_file_${patientId}`}>File name</Label>
        <Input id={`doc_file_${patientId}`} value={fileName} onChange={(event) => setFileName(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`doc_content_type_${patientId}`}>Content type</Label>
        <Input
          id={`doc_content_type_${patientId}`}
          value={contentType}
          onChange={(event) => setContentType(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`doc_size_${patientId}`}>Byte size</Label>
        <Input id={`doc_size_${patientId}`} inputMode="numeric" value={byteSize} onChange={(event) => setByteSize(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`doc_storage_${patientId}`}>Storage key</Label>
        <Input id={`doc_storage_${patientId}`} value={storageKey} onChange={(event) => setStorageKey(event.target.value)} />
        <FormFieldError error={error} name="storage_key" />
      </div>
      <div className="md:col-span-2">
        <Button type="submit" size="sm" disabled={mutation.isPending}>
          {mutation.isPending ? "Adding…" : "Add document"}
        </Button>
      </div>
      <div className="md:col-span-2">
        <FormError error={error} />
      </div>
    </form>
  );
}

function EditContactForm({
  patientId,
  contacts,
  onUpdated,
}: {
  patientId: string;
  contacts: PatientProfile["contacts"];
  onUpdated: () => void;
}) {
  const queryClient = useQueryClient();
  const [contactId, setContactId] = useState("");
  const [kind, setKind] = useState("phone");
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("patients.contact_update", isOnline());
      return api(`/patients/${patientId}/contacts/${contactId}/`, {
        method: "PATCH",
        body: JSON.stringify({ kind, name: name || undefined, value, is_primary: isPrimary }),
      });
    },
    onSuccess: async () => {
      setError(null);
      toast.success("Contact updated.");
      await queryClient.invalidateQueries({ queryKey: ["patients"] });
      onUpdated();
    },
    onError: (caught) => setError(caught),
  });

  if (contacts.length === 0) {
    return null;
  }

  function loadContact(id: string) {
    const contact = contacts.find((row) => row.id === id);
    if (!contact) {
      return;
    }
    setContactId(id);
    setKind(contact.kind);
    setName(contact.name);
    setValue(contact.value);
    setIsPrimary(contact.is_primary);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!validateForm(contactEditSchema, { contactId, kind, value, is_primary: isPrimary }, setError)) {
      return;
    }
    mutation.mutate();
  }

  return (
    <form className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-2" onSubmit={onSubmit}>
      <p className="text-sm font-medium md:col-span-2">Edit contact</p>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor={`edit_contact_${patientId}`}>Contact</Label>
        <Select value={contactId} onValueChange={loadContact}>
          <SelectTrigger id={`edit_contact_${patientId}`} className="w-full">
            <SelectValue placeholder="Select contact" />
          </SelectTrigger>
          <SelectContent>
            {contacts.map((contact) => (
              <SelectItem key={contact.id} value={contact.id}>
                {contact.kind}: {contact.value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`edit_contact_kind_${patientId}`}>Kind</Label>
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger id={`edit_contact_kind_${patientId}`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {contactKindOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`edit_contact_name_${patientId}`}>Name</Label>
        <Input id={`edit_contact_name_${patientId}`} value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`edit_contact_value_${patientId}`}>Value</Label>
        <Input id={`edit_contact_value_${patientId}`} value={value} onChange={(event) => setValue(event.target.value)} />
      </div>
      <div className="flex items-end">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isPrimary} onChange={(event) => setIsPrimary(event.target.checked)} />
          Primary contact
        </label>
      </div>
      <div className="md:col-span-2">
        <Button type="submit" size="sm" disabled={mutation.isPending || !contactId}>
          {mutation.isPending ? "Saving…" : "Save contact"}
        </Button>
      </div>
      <div className="md:col-span-2">
        <FormError error={error} />
      </div>
    </form>
  );
}

function EditAddressForm({
  patientId,
  addresses,
  onUpdated,
}: {
  patientId: string;
  addresses: PatientProfile["addresses"];
  onUpdated: () => void;
}) {
  const queryClient = useQueryClient();
  const [addressId, setAddressId] = useState("");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("patients.address_update", isOnline());
      return api(`/patients/${patientId}/addresses/${addressId}/`, {
        method: "PATCH",
        body: JSON.stringify({
          line1,
          line2: line2 || undefined,
          city,
          region: region || undefined,
          postal_code: postalCode || undefined,
          country,
          is_primary: isPrimary,
        }),
      });
    },
    onSuccess: async () => {
      setError(null);
      toast.success("Address updated.");
      await queryClient.invalidateQueries({ queryKey: ["patients"] });
      onUpdated();
    },
    onError: (caught) => setError(caught),
  });

  if (addresses.length === 0) {
    return null;
  }

  function loadAddress(id: string) {
    const address = addresses.find((row) => row.id === id);
    if (!address) {
      return;
    }
    setAddressId(id);
    setLine1(address.line1);
    setLine2(address.line2);
    setCity(address.city);
    setRegion(address.region);
    setPostalCode(address.postal_code);
    setCountry(address.country);
    setIsPrimary(address.is_primary);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (
      !validateForm(
        addressEditSchema,
        { addressId, line1, line2, city, region, postal_code: postalCode, country },
        setError,
      )
    ) {
      return;
    }
    mutation.mutate();
  }

  return (
    <form className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-2" onSubmit={onSubmit}>
      <p className="text-sm font-medium md:col-span-2">Edit address</p>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor={`edit_address_${patientId}`}>Address</Label>
        <Select value={addressId} onValueChange={loadAddress}>
          <SelectTrigger id={`edit_address_${patientId}`} className="w-full">
            <SelectValue placeholder="Select address" />
          </SelectTrigger>
          <SelectContent>
            {addresses.map((address) => (
              <SelectItem key={address.id} value={address.id}>
                {address.line1}, {address.city}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`edit_line1_${patientId}`}>Line 1</Label>
        <Input id={`edit_line1_${patientId}`} value={line1} onChange={(event) => setLine1(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`edit_line2_${patientId}`}>Line 2</Label>
        <Input id={`edit_line2_${patientId}`} value={line2} onChange={(event) => setLine2(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`edit_city_${patientId}`}>City</Label>
        <Input id={`edit_city_${patientId}`} value={city} onChange={(event) => setCity(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`edit_country_${patientId}`}>Country</Label>
        <Input id={`edit_country_${patientId}`} value={country} onChange={(event) => setCountry(event.target.value)} />
      </div>
      <div className="md:col-span-2">
        <Button type="submit" size="sm" disabled={mutation.isPending || !addressId}>
          {mutation.isPending ? "Saving…" : "Save address"}
        </Button>
      </div>
      <div className="md:col-span-2">
        <FormError error={error} />
      </div>
    </form>
  );
}

function EditDocumentForm({
  patientId,
  documents,
  onUpdated,
}: {
  patientId: string;
  documents: PatientProfile["documents"];
  onUpdated: () => void;
}) {
  const queryClient = useQueryClient();
  const [documentId, setDocumentId] = useState("");
  const [title, setTitle] = useState("");
  const [documentType, setDocumentType] = useState("other");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("patients.document_update", isOnline());
      return api(`/patients/${patientId}/documents/${documentId}/`, {
        method: "PATCH",
        body: JSON.stringify({ title, document_type: documentType, file_name: fileName }),
      });
    },
    onSuccess: async () => {
      setError(null);
      toast.success("Document updated.");
      await queryClient.invalidateQueries({ queryKey: ["patients"] });
      onUpdated();
    },
    onError: (caught) => setError(caught),
  });

  if (documents.length === 0) {
    return null;
  }

  function loadDocument(id: string) {
    const document = documents.find((row) => row.id === id);
    if (!document) {
      return;
    }
    setDocumentId(id);
    setTitle(document.title);
    setDocumentType(document.document_type);
    setFileName(document.file_name);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (
      !validateForm(
        documentEditSchema,
        { documentId, title, document_type: documentType, file_name: fileName },
        setError,
      )
    ) {
      return;
    }
    mutation.mutate();
  }

  return (
    <form className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-2" onSubmit={onSubmit}>
      <p className="text-sm font-medium md:col-span-2">Edit document</p>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor={`edit_document_${patientId}`}>Document</Label>
        <Select value={documentId} onValueChange={loadDocument}>
          <SelectTrigger id={`edit_document_${patientId}`} className="w-full">
            <SelectValue placeholder="Select document" />
          </SelectTrigger>
          <SelectContent>
            {documents.map((document) => (
              <SelectItem key={document.id} value={document.id}>
                {document.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`edit_doc_title_${patientId}`}>Title</Label>
        <Input id={`edit_doc_title_${patientId}`} value={title} onChange={(event) => setTitle(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`edit_doc_type_${patientId}`}>Type</Label>
        <Select value={documentType} onValueChange={setDocumentType}>
          <SelectTrigger id={`edit_doc_type_${patientId}`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {documentTypeOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor={`edit_doc_file_${patientId}`}>File name</Label>
        <Input id={`edit_doc_file_${patientId}`} value={fileName} onChange={(event) => setFileName(event.target.value)} />
      </div>
      <div className="md:col-span-2">
        <Button type="submit" size="sm" disabled={mutation.isPending || !documentId}>
          {mutation.isPending ? "Saving…" : "Save document"}
        </Button>
      </div>
      <div className="md:col-span-2">
        <FormError error={error} />
      </div>
    </form>
  );
}
