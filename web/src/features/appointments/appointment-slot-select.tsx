"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { QueryState, describeError } from "@/components/query-state";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { generateAppointmentSlots } from "@/features/appointments/appointment-slots";
import { useAuth } from "@/features/auth/auth-provider";
import { api, withQuery } from "@/lib/api/client";
import type { DoctorSchedule, Page } from "@/lib/api/types";

export function AppointmentSlotSelect({
  id,
  doctorId,
  value,
  onValueChange,
}: {
  id: string;
  doctorId: string;
  value: string;
  onValueChange: (slotId: string, startsAt: string, endsAt: string) => void;
}) {
  const { account, branchId } = useAuth();
  const timeZone =
    account?.clinic_timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  const schedules = useQuery({
    queryKey: ["doctor-schedules", "slots", doctorId, branchId],
    enabled: Boolean(doctorId),
    queryFn: async () => {
      const page = await api<Page<DoctorSchedule>>(
        withQuery("/doctor-schedules/", {
          doctor: doctorId,
          page_size: "100",
          is_active: "true",
        }),
      );
      return page.results;
    },
    staleTime: 60_000,
  });

  const slots = generateAppointmentSlots(schedules.data ?? [], timeZone);

  if (!doctorId) {
    return (
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor={id}>Appointment time</Label>
        <p className="text-sm text-muted-foreground">Select a doctor to see available times.</p>
      </div>
    );
  }

  if (schedules.isLoading) {
    return (
      <div className="md:col-span-2">
        <QueryState status="loading" />
      </div>
    );
  }

  if (schedules.isError) {
    return (
      <div className="md:col-span-2">
        <QueryState status="error" detail={describeError(schedules.error)} onRetry={() => void schedules.refetch()} />
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor={id}>Appointment time</Label>
        <p className="text-sm text-muted-foreground">
          No bookable slots found for this doctor. Add an active schedule under{" "}
          <Link href="/schedules" className="font-medium text-primary hover:underline">
            Schedules
          </Link>{" "}
          and ensure the correct branch is selected in the sidebar.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 md:col-span-2">
      <Label htmlFor={id}>Appointment time</Label>
      <Select
        value={value || undefined}
        onValueChange={(slotId) => {
          const slot = slots.find((row) => row.id === slotId);
          if (slot) {
            onValueChange(slot.id, slot.starts_at, slot.ends_at);
          }
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Select an available slot" />
        </SelectTrigger>
        <SelectContent position="popper" className="z-[100] max-h-72">
          {slots.map((slot) => (
            <SelectItem key={slot.id} value={slot.id}>
              {slot.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Times shown in clinic timezone ({timeZone}). Slots match the doctor&apos;s schedule exactly.
      </p>
    </div>
  );
}
