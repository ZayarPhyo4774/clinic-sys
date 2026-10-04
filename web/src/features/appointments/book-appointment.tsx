"use client";

import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

import { DoctorSelect, PatientSelect } from "@/components/entity-picker";
import { FormError, FormFieldError } from "@/components/form-field-error";
import { AppointmentSlotSelect } from "@/features/appointments/appointment-slot-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { allowed } from "@/features/access/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import { api } from "@/lib/api/client";
import { validationError } from "@/lib/api/errors";
import { bookAppointmentSchema, formatZodError } from "@/lib/forms/schemas";
import type { Appointment } from "@/lib/api/types";
import { isOnline } from "@/offline/connectivity/network";
import { requireOnlineMutation } from "@/offline/sync/policy";

export function BookAppointment() {
  const { account, branchId } = useAuth();
  const queryClient = useQueryClient();
  const [patient, setPatient] = useState("");
  const [doctor, setDoctor] = useState("");
  const [slotId, setSlotId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [visitReason, setVisitReason] = useState("");
  const [error, setError] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: (payload: {
      patient: string;
      doctor: string;
      starts_at: string;
      ends_at: string;
      visit_reason: string;
    }) => {
      requireOnlineMutation("appointments.book", isOnline());
      return api<Appointment>("/appointments/", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async () => {
      setPatient("");
      setDoctor("");
      setSlotId("");
      setStartsAt("");
      setEndsAt("");
      setVisitReason("");
      setError(null);
      toast.success("Appointment booked.");
      await queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: (caught) => setError(caught),
  });

  if (!account || !allowed(account.permissions, "appointments.create")) {
    return null;
  }

  function onSlotChange(nextSlotId: string, nextStartsAt: string, nextEndsAt: string) {
    setSlotId(nextSlotId);
    setStartsAt(nextStartsAt);
    setEndsAt(nextEndsAt);
    setError(null);
  }

  function onDoctorChange(nextDoctor: string) {
    setDoctor(nextDoctor);
    setSlotId("");
    setStartsAt("");
    setEndsAt("");
    setError(null);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const parsed = bookAppointmentSchema.safeParse({
      patient,
      doctor,
      starts_at: startsAt,
      ends_at: endsAt,
      visit_reason: visitReason,
    });
    if (!parsed.success) {
      setError(validationError(formatZodError(parsed.error)));
      return;
    }
    mutation.mutate({
      patient: parsed.data.patient,
      doctor: parsed.data.doctor,
      starts_at: startsAt,
      ends_at: endsAt,
      visit_reason: parsed.data.visit_reason,
    });
  }

  return (
    <Card className="shadow-premium-sm">
      <CardHeader>
        <CardTitle>Book appointment</CardTitle>
        <CardDescription>
          Choose a doctor and an available slot from their schedule.{" "}
          {!branchId ? (
            <span className="text-warning-foreground">
              Select a branch in the sidebar before booking.
            </span>
          ) : (
            <Link href="/schedules" className="font-medium text-primary hover:underline">
              Manage schedules
            </Link>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
          <PatientSelect id="book_patient" value={patient} onValueChange={setPatient} />
          <DoctorSelect id="book_doctor" value={doctor} onValueChange={onDoctorChange} />
          <AppointmentSlotSelect
            id="book_slot"
            doctorId={doctor}
            value={slotId}
            onValueChange={onSlotChange}
          />
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="visit_reason">Visit reason</Label>
            <Input
              id="visit_reason"
              placeholder="Follow-up, new complaint, etc."
              value={visitReason}
              onChange={(event) => setVisitReason(event.target.value)}
            />
            <FormFieldError error={error} name="visit_reason" />
          </div>
          <div className="md:col-span-2">
            <Button type="submit" disabled={mutation.isPending || !branchId || !slotId}>
              {mutation.isPending ? "Booking…" : "Book appointment"}
            </Button>
          </div>
          <div className="md:col-span-2 space-y-1">
            <FormFieldError error={error} name="patient" />
            <FormFieldError error={error} name="doctor" />
            <FormFieldError error={error} name="starts_at" />
            <FormFieldError error={error} name="ends_at" />
            <FormFieldError error={error} name="branch" />
            <FormError error={error} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
