"use client";

import { CheckCircle2, Search, UserPlus, Users, X } from "lucide-react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { DoctorSelect } from "@/components/entity-picker";
import { FormError, FormFieldError } from "@/components/form-field-error";
import { PageHeader } from "@/components/page-header";
import { QueryState, describeError } from "@/components/query-state";
import { StatusText } from "@/components/record-browser";
import { DoctorLabel, PatientLink } from "@/components/record-link";
import { Badge } from "@/components/ui/badge";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { allowed } from "@/features/access/navigation";
import { canUseWalkIn } from "@/features/access/permissions";
import { RequirePermission } from "@/features/access/require-permission";
import { QueueActions } from "@/features/queue/queue-actions";
import { TriageStatusBadge } from "@/features/queue/triage-status";
import { useAuth } from "@/features/auth/auth-provider";
import { PatientBirthFields } from "@/features/patients/patient-birth-fields";
import { sexOptions } from "@/features/patients/contract";
import { api, withQuery } from "@/lib/api/client";
import { ApiError, validationError } from "@/lib/api/errors";
import { formatZodError, registerPatientSchema } from "@/lib/forms/schemas";
import type { Page, Patient, QueueEntry, WalkInResult } from "@/lib/api/types";
import type { PatientBirthMode } from "@/lib/patients/age";
import { formatPatientBirthSummary } from "@/lib/patients/age";
import { buildPatientDemographicsPayload } from "@/lib/patients/birth-schema";
import { cn } from "@/lib/utils";
import { isOnline } from "@/offline/connectivity/network";
import { requireOnlineMutation } from "@/offline/sync/policy";

type LastCheckIn = {
  patientName: string;
  queuePosition: number;
  appointmentId: string;
  queueEntryId: string;
};

function WalkInGate() {
  const { account, isLoading } = useAuth();

  if (isLoading || !account) {
    return <QueryState status="loading" />;
  }

  if (!canUseWalkIn(account.permissions)) {
    return (
      <QueryState
        status="forbidden"
        title="Walk-in"
        detail="Your role needs both appointments.create and appointments.update. Assign Solo Practitioner or Receptionist under Roles, then sign in again."
      />
    );
  }

  return <WalkInDesk />;
}

export function WalkInScreen() {
  return (
    <RequirePermission permission="appointments.view" title="Walk-in">
      <WalkInGate />
    </RequirePermission>
  );
}

function WalkInDesk() {
  const { account, branchId, isLoading: authLoading } = useAuth();
  const accountEmail = account?.email;
  const accountName = account?.full_name;
  const queryClient = useQueryClient();
  const canRegister = Boolean(account && allowed(account.permissions, "patients.create"));

  const [patientTab, setPatientTab] = useState<"search" | "register">("search");
  const [search, setSearch] = useState("");
  const [patientId, setPatientId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [visitReason, setVisitReason] = useState("Walk-in");
  const [registerName, setRegisterName] = useState("");
  const [registerBirthMode, setRegisterBirthMode] = useState<PatientBirthMode>("dob");
  const [registerDob, setRegisterDob] = useState("");
  const [registerAge, setRegisterAge] = useState("");
  const [registerSex, setRegisterSex] = useState("");
  const [formError, setFormError] = useState<unknown>(null);
  const [registerError, setRegisterError] = useState<unknown>(null);
  const [lastCheckIn, setLastCheckIn] = useState<LastCheckIn | null>(null);

  const patientsQuery = useQuery({
    queryKey: ["patients", "walk-in"],
    queryFn: async () => {
      const page = await api<Page<Patient>>(withQuery("/patients/", { page_size: "200" }));
      return page.results;
    },
  });

  const queueQuery = useQuery({
    queryKey: ["queue", "walk-in", branchId],
    queryFn: async () => {
      const page = await api<Page<QueueEntry>>(withQuery("/queue-entries/", { page_size: "50" }));
      return page.results.filter((row) =>
        row.status === "waiting" || row.status === "called" || row.status === "in_service",
      );
    },
    refetchInterval: 15_000,
  });

  const filteredPatients = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = patientsQuery.data ?? [];
    const matches = !needle
      ? rows.slice(0, 12)
      : rows.filter(
          (row) =>
            row.full_name.toLowerCase().includes(needle) ||
            row.patient_number.toLowerCase().includes(needle),
        );

    if (!patientId) {
      return matches.slice(0, 12);
    }

    const selected = rows.find((row) => row.id === patientId);
    if (!selected || matches.some((row) => row.id === patientId)) {
      return matches.slice(0, 12);
    }

    return [selected, ...matches].slice(0, 12);
  }, [patientsQuery.data, patientId, search]);

  const selectedPatient = patientsQuery.data?.find((row) => row.id === patientId);

  const registerMutation = useMutation({
    mutationFn: (payload: Record<string, string | number>) => {
      requireOnlineMutation("patients.register", isOnline());
      return api<Patient>("/patients/", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async (patient) => {
      setRegisterName("");
      setRegisterBirthMode("dob");
      setRegisterDob("");
      setRegisterAge("");
      setRegisterSex("");
      setRegisterError(null);
      setPatientId(patient.id);
      setPatientTab("search");
      setSearch(patient.full_name);
      toast.success(`Registered ${patient.full_name}.`);
      await queryClient.invalidateQueries({ queryKey: ["patients"] });
    },
    onError: (error) => setRegisterError(error),
  });

  const walkInMutation = useMutation({
    mutationFn: (payload: { patient: string; doctor: string; visit_reason: string }) => {
      requireOnlineMutation("appointments.walk_in", isOnline());
      return api<WalkInResult>("/appointments/walk-in/", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async (result) => {
      const patientName =
        selectedPatient?.full_name ??
        patientsQuery.data?.find((row) => row.id === result.appointment.patient)?.full_name ??
        "Patient";
      setLastCheckIn({
        patientName,
        queuePosition: result.queue_entry.position,
        appointmentId: result.appointment.id,
        queueEntryId: result.queue_entry.id,
      });
      setPatientId("");
      setSearch("");
      setVisitReason("Walk-in");
      setFormError(null);
      toast.success(`${patientName} added to queue (#${result.queue_entry.position}).`);
      await queryClient.invalidateQueries({ queryKey: ["appointments"] });
      await queryClient.invalidateQueries({ queryKey: ["queue"] });
    },
    onError: (error) => setFormError(error),
  });

  useEffect(() => {
    setLastCheckIn(null);
  }, [patientId, doctorId]);

  function onRegisterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRegisterError(null);
    const parsed = registerPatientSchema.safeParse({
      full_name: registerName,
      birth_mode: registerBirthMode,
      date_of_birth: registerDob,
      age: registerAge,
      sex: registerSex || undefined,
    });
    if (!parsed.success) {
      setRegisterError(validationError(formatZodError(parsed.error)));
      return;
    }
    registerMutation.mutate(buildPatientDemographicsPayload(parsed.data));
  }

  function onCheckIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    if (!patientId) {
      setFormError(validationError({ patient: ["Choose a patient."] }));
      return;
    }
    if (!doctorId) {
      setFormError(validationError({ doctor: ["Choose a doctor."] }));
      return;
    }
    if (!branchId) {
      setFormError(validationError({ branch: ["Select a branch in the sidebar."] }));
      return;
    }
    walkInMutation.mutate({
      patient: patientId,
      doctor: doctorId,
      visit_reason: visitReason.trim() || "Walk-in",
    });
  }

  const waitingCount = queueQuery.data?.filter((row) => row.status === "waiting").length ?? 0;
  const lastCheckInEntry = lastCheckIn
    ? queueQuery.data?.find((row) => row.id === lastCheckIn.queueEntryId)
    : undefined;

  return (
    <section className="space-y-8">
      <PageHeader
        eyebrow="Operations"
        title="Walk-in desk"
        // description="POS-style check-in for patients without an appointment. One tap books the next slot, checks the patient in, and adds them to the queue."
        action={
          <Button asChild variant="outline">
            <Link href="/queue">Open queue board</Link>
          </Button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card className="shadow-premium-sm">
          <CardHeader>
            <CardTitle>Check in patient</CardTitle>
            <CardDescription>
              Find or register a patient, choose the doctor, then send them to the waiting queue.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {authLoading ? <QueryState status="loading" /> : null}
            {!authLoading && !branchId ? (
              <div className="rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning-foreground">
                Select a branch in the sidebar before checking in walk-ins.
              </div>
            ) : null}

            <Tabs value={patientTab} onValueChange={(value) => setPatientTab(value as "search" | "register")}>
              <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
                <TabsTrigger value="search">Find patient</TabsTrigger>
                {canRegister ? <TabsTrigger value="register">New patient</TabsTrigger> : null}
              </TabsList>

              <TabsContent value="search" className="mt-4 space-y-4">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    placeholder="Search by name or patient number…"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="pl-9"
                  />
                </div>

                {patientsQuery.isLoading ? <QueryState status="loading" /> : null}
                {patientsQuery.isError ? (
                  <QueryState
                    status="error"
                    detail={describeError(patientsQuery.error)}
                    onRetry={() => void patientsQuery.refetch()}
                  />
                ) : null}

                <div className="grid gap-2 sm:grid-cols-2">
                  {filteredPatients.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => setPatientId(row.id)}
                      className={cn(
                        "rounded-xl border px-4 py-3 text-left transition-colors",
                        patientId === row.id
                          ? "border-primary bg-primary/5 shadow-premium-sm"
                          : "hover:border-primary/40 hover:bg-muted/40",
                      )}
                    >
                      <p className="font-medium">{row.full_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {row.patient_number} · {formatPatientBirthSummary(row)}
                      </p>
                    </button>
                  ))}
                </div>
                {!patientsQuery.isLoading && filteredPatients.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No patients match. {canRegister ? "Switch to New patient to register." : "Register patients on the Patients screen."}
                  </p>
                ) : null}
              </TabsContent>

              {canRegister ? (
                <TabsContent value="register" className="mt-4">
                  <form className="grid gap-4 sm:grid-cols-2" onSubmit={onRegisterSubmit}>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="walkin_name">Full name</Label>
                      <Input
                        id="walkin_name"
                        value={registerName}
                        required
                        onChange={(event) => setRegisterName(event.target.value)}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <PatientBirthFields
                        idPrefix="walkin"
                        mode={registerBirthMode}
                        onModeChange={setRegisterBirthMode}
                        dateOfBirth={registerDob}
                        onDateOfBirthChange={setRegisterDob}
                        age={registerAge}
                        onAgeChange={setRegisterAge}
                        error={registerError}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="walkin_sex">Sex</Label>
                      <Select value={registerSex || undefined} onValueChange={setRegisterSex}>
                        <SelectTrigger id="walkin_sex" className="w-full">
                          <SelectValue placeholder="Select sex" />
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
                    <div className="sm:col-span-2">
                      <Button type="submit" disabled={registerMutation.isPending}>
                        {registerMutation.isPending ? "Registering…" : "Register and select"}
                      </Button>
                    </div>
                    <div className="sm:col-span-2 space-y-1">
                      <FormFieldError error={registerError} name="full_name" />
                      <FormFieldError error={registerError} name="age" />
                      <FormFieldError error={registerError} name="date_of_birth" />
                      <FormFieldError error={registerError} name="sex" />
                      <FormError error={registerError} />
                    </div>
                  </form>
                </TabsContent>
              ) : null}
            </Tabs>

            <form className="space-y-4 border-t pt-6" onSubmit={onCheckIn}>
              <div className="grid gap-4 sm:grid-cols-2">
                <DoctorSelect
                  id="walkin_doctor"
                  value={doctorId}
                  onValueChange={setDoctorId}
                  preferEmail={accountEmail}
                  preferName={accountName}
                />
                <div className="space-y-2">
                  <Label htmlFor="walkin_reason">Visit reason</Label>
                  <Input
                    id="walkin_reason"
                    value={visitReason}
                    placeholder="Walk-in"
                    onChange={(event) => setVisitReason(event.target.value)}
                  />
                </div>
              </div>

              {selectedPatient ? (
                <div className="flex items-center gap-3 rounded-xl border bg-muted/30 px-4 py-3">
                  <Users className="size-5 shrink-0 text-primary" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">Selected patient</p>
                    <p className="text-sm text-muted-foreground">
                      {selectedPatient.full_name} · {selectedPatient.patient_number}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      setPatientId("");
                      setSearch("");
                    }}
                  >
                    <X className="size-4" aria-hidden="true" />
                    Change
                  </Button>
                </div>
              ) : null}

              <Button
                type="submit"
                className="h-14 w-full text-base"
                disabled={authLoading || walkInMutation.isPending || !branchId || !patientId || !doctorId}
              >
                {walkInMutation.isPending ? "Checking in…" : "Check in to queue"}
              </Button>

              <div className="space-y-1">
                <FormFieldError error={formError} name="patient" />
                <FormFieldError error={formError} name="doctor" />
                <FormFieldError error={formError} name="branch" />
                <FormFieldError error={formError} name="starts_at" />
                <FormError error={formError} />
                {formError instanceof ApiError && formError.status === 403 ? (
                  <p className="text-sm text-muted-foreground">
                    Use an assigned branch in the sidebar. Demo doctor needs the Solo Practitioner role with
                    appointments.create and appointments.update.
                  </p>
                ) : null}
              </div>
            </form>

            {lastCheckIn ? (
              <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/5 px-4 py-4">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
                <div className="space-y-3">
                  <div className="space-y-1">
                    <p className="font-semibold">{lastCheckIn.patientName} is in the queue</p>
                    <p className="text-sm text-muted-foreground">
                      Queue position <Badge variant="info">#{lastCheckIn.queuePosition}</Badge>. The next slot was
                      booked automatically.
                    </p>
                  </div>
                  {lastCheckInEntry ? <QueueActions entry={lastCheckInEntry} compact /> : null}
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/appointments/${lastCheckIn.appointmentId}`}>Open visit</Link>
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="shadow-premium-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Waiting now
              <Badge variant="info">{waitingCount}</Badge>
            </CardTitle>
            <CardDescription>
              Call patients in, start the visit, then start the consultation. Refreshes every 15 seconds.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {queueQuery.isLoading ? <QueryState status="loading" /> : null}
            {queueQuery.isError ? (
              <QueryState
                status="error"
                detail={describeError(queueQuery.error)}
                onRetry={() => void queueQuery.refetch()}
              />
            ) : null}
            {(queueQuery.data ?? []).length === 0 && !queueQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">No one waiting right now.</p>
            ) : null}
            {(queueQuery.data ?? []).map((row) => (
              <div
                key={row.id}
                className="flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="truncate font-medium">
                    <PatientLink id={row.patient} />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <DoctorLabel id={row.doctor} fullName={row.doctor_full_name} /> · Position {row.position} ·{" "}
                    {row.service_date}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <StatusText value={row.status} />
                    <TriageStatusBadge entry={row} />
                  </div>
                  <QueueActions entry={row} compact />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {canRegister ? (
        <Card className="border-primary/20 bg-primary/5 shadow-premium-sm">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <UserPlus className="mt-0.5 size-5 text-primary" aria-hidden="true" />
              <div>
                <p className="font-semibold">Solo clinic tip</p>
                <p className="text-sm text-muted-foreground">
                  After check-in, call the patient, start the visit, then start the consultation from the queue panel.
                </p>
              </div>
            </div>
            <Button asChild variant="outline">
              <Link href="/queue">Go to queue</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
