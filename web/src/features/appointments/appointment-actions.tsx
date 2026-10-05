"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ActionBar } from "@/components/action-bar";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormError } from "@/components/form-field-error";
import { AppointmentSlotSelect } from "@/features/appointments/appointment-slot-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Link from "next/link";

import { allowed } from "@/features/access/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import { api } from "@/lib/api/client";
import type { Appointment, Encounter } from "@/lib/api/types";
import { rescheduleSchema, validateForm } from "@/lib/forms/schemas";
import { isOnline } from "@/offline/connectivity/network";
import { requireOnlineMutation } from "@/offline/sync/policy";

type AppointmentAction = "confirm" | "check-in" | "queue" | "cancel" | "reschedule" | "no-show";

const actionLabels: Record<AppointmentAction, string> = {
  confirm: "Confirm",
  "check-in": "Check in",
  queue: "Add to queue",
  cancel: "Cancel appointment",
  reschedule: "Reschedule",
  "no-show": "Mark no-show",
};

function slotIdForAppointment(startsAt: string, endsAt: string) {
  return `${startsAt}|${endsAt}`;
}

export function appointmentActionsForStatus(status: string): AppointmentAction[] {
  switch (status) {
    case "scheduled":
      return ["confirm", "reschedule", "no-show", "cancel"];
    case "confirmed":
      return ["check-in", "reschedule", "no-show", "cancel"];
    case "checked_in":
      return ["queue", "cancel"];
    default:
      return [];
  }
}

export function AppointmentActions({
  appointment,
  encounter,
  onUpdated,
}: {
  appointment: Appointment;
  encounter: Encounter | undefined;
  onUpdated: () => void;
}) {
  const { account } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pendingCancel, setPendingCancel] = useState(false);
  const [pendingNoShow, setPendingNoShow] = useState(false);
  const [pendingReschedule, setPendingReschedule] = useState(false);
  const [slotId, setSlotId] = useState(() => slotIdForAppointment(appointment.starts_at, appointment.ends_at));
  const [startsAt, setStartsAt] = useState(appointment.starts_at);
  const [endsAt, setEndsAt] = useState(appointment.ends_at);
  const [rescheduleError, setRescheduleError] = useState<unknown>(null);

  const canUpdate = Boolean(account && allowed(account.permissions, "appointments.update"));
  const canCancel = Boolean(account && allowed(account.permissions, "appointments.cancel"));
  const canViewEncounter = Boolean(account && allowed(account.permissions, "encounters.view"));
  const canStartEncounter = Boolean(
    account &&
      allowed(account.permissions, "encounters.create") &&
      appointment.status === "in_consultation" &&
      !encounter,
  );
  const canOpenEncounter = Boolean(canViewEncounter && encounter && appointment.status === "in_consultation");

  const mutation = useMutation({
    mutationFn: (action: AppointmentAction) => {
      requireOnlineMutation(`appointments.${action}`, isOnline());
      return api<Appointment>(`/appointments/${appointment.id}/${action}/`, {
        method: "POST",
        body: "{}",
      });
    },
    onSuccess: async (_data, action) => {
      toast.success(actionLabels[action]);
      await queryClient.invalidateQueries({ queryKey: ["appointments"] });
      await queryClient.invalidateQueries({ queryKey: ["queue"] });
      onUpdated();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "The appointment action was rejected.");
    },
  });

  const rescheduleMutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("appointments.reschedule", isOnline());
      return api<Appointment>(`/appointments/${appointment.id}/reschedule/`, {
        method: "POST",
        body: JSON.stringify({
          starts_at: startsAt,
          ends_at: endsAt,
        }),
      });
    },
    onSuccess: async () => {
      setPendingReschedule(false);
      setRescheduleError(null);
      toast.success("Appointment rescheduled.");
      await queryClient.invalidateQueries({ queryKey: ["appointments"] });
      onUpdated();
    },
    onError: (error) => setRescheduleError(error),
  });

  const noShowMutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("appointments.no-show", isOnline());
      return api<Appointment>(`/appointments/${appointment.id}/no-show/`, {
        method: "POST",
        body: "{}",
      });
    },
    onSuccess: async () => {
      setPendingNoShow(false);
      toast.success("Marked as no-show.");
      await queryClient.invalidateQueries({ queryKey: ["appointments"] });
      onUpdated();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "The appointment could not be marked no-show.");
    },
  });

  const startEncounter = useMutation({
    mutationFn: () => {
      requireOnlineMutation("encounters.start", isOnline());
      return api<Encounter>("/encounters/", {
        method: "POST",
        body: JSON.stringify({ appointment: appointment.id }),
      });
    },
    onSuccess: async (created) => {
      toast.success("Consultation started.");
      await queryClient.invalidateQueries({ queryKey: ["encounters"] });
      onUpdated();
      router.push(`/consultation/${created.id}`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "The consultation could not be started.");
    },
  });

  const actions = appointmentActionsForStatus(appointment.status).filter((action) => {
    if (action === "cancel") {
      return canCancel;
    }
    return canUpdate;
  });

  if (actions.length === 0 && !canStartEncounter && !canOpenEncounter) {
    return null;
  }

  function onRescheduleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRescheduleError(null);
    if (!validateForm(rescheduleSchema, { starts_at: startsAt, ends_at: endsAt }, setRescheduleError)) {
      return;
    }
    rescheduleMutation.mutate();
  }

  return (
    <>
      <ActionBar>
        {actions.map((action) => (
          <Button
            key={action}
            type="button"
            variant={action === "cancel" || action === "no-show" ? "outline" : "default"}
            disabled={mutation.isPending || rescheduleMutation.isPending || noShowMutation.isPending}
            onClick={() => {
              if (action === "cancel") {
                setPendingCancel(true);
                return;
              }
              if (action === "no-show") {
                setPendingNoShow(true);
                return;
              }
              if (action === "reschedule") {
                setSlotId(slotIdForAppointment(appointment.starts_at, appointment.ends_at));
                setStartsAt(appointment.starts_at);
                setEndsAt(appointment.ends_at);
                setRescheduleError(null);
                setPendingReschedule(true);
                return;
              }
              mutation.mutate(action);
            }}
          >
            {actionLabels[action]}
          </Button>
        ))}
        {canOpenEncounter && encounter ? (
          <Button asChild>
            <Link href={`/consultation/${encounter.id}`}>Open consultation</Link>
          </Button>
        ) : null}
        {canStartEncounter ? (
          <Button type="button" disabled={startEncounter.isPending} onClick={() => startEncounter.mutate()}>
            {startEncounter.isPending ? "Starting…" : "Start consultation"}
          </Button>
        ) : null}
      </ActionBar>

      <Dialog open={pendingCancel} onOpenChange={setPendingCancel}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel appointment</DialogTitle>
            <DialogDescription>This cancels the visit and any open queue entry.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingCancel(false)}>
              Keep appointment
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={mutation.isPending}
              onClick={() => {
                mutation.mutate("cancel");
                setPendingCancel(false);
              }}
            >
              Cancel appointment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingNoShow}
        onOpenChange={setPendingNoShow}
        title="Mark as no-show?"
        description="The patient did not attend this scheduled visit."
        confirmLabel="Mark no-show"
        destructive
        pending={noShowMutation.isPending}
        onConfirm={() => noShowMutation.mutate()}
      />

      <Dialog open={pendingReschedule} onOpenChange={setPendingReschedule}>
        <DialogContent>
          <form onSubmit={onRescheduleSubmit}>
            <DialogHeader>
              <DialogTitle>Reschedule appointment</DialogTitle>
              <DialogDescription>Choose a new start and end time within the doctor&apos;s schedule.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <AppointmentSlotSelect
                id="reschedule_slot"
                doctorId={appointment.doctor}
                value={slotId}
                onValueChange={(nextSlotId, nextStartsAt, nextEndsAt) => {
                  setSlotId(nextSlotId);
                  setStartsAt(nextStartsAt);
                  setEndsAt(nextEndsAt);
                  setRescheduleError(null);
                }}
              />
              <FormError error={rescheduleError} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPendingReschedule(false)}>
                Keep current time
              </Button>
              <Button type="submit" disabled={rescheduleMutation.isPending || !slotId}>
                {rescheduleMutation.isPending ? "Saving…" : "Reschedule"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
