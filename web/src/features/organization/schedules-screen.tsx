"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

import { BranchSelect, DoctorSelect } from "@/components/entity-picker";
import { FormError, FormFieldError } from "@/components/form-field-error";
import { RecordBrowser, StatusText } from "@/components/record-browser";
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
import { RequirePermission } from "@/features/access/require-permission";
import { weekdayOptions } from "@/features/organization/contract";
import { ToggleActiveButton } from "@/features/organization/org-writes";
import { api } from "@/lib/api/client";
import type { DoctorSchedule } from "@/lib/api/types";
import { scheduleCreateSchema, validateForm } from "@/lib/forms/schemas";
import { isOnline } from "@/offline/connectivity/network";
import { requireOnlineMutation } from "@/offline/sync/policy";

const weekdayLabel = Object.fromEntries(weekdayOptions.map((option) => [option.value, option.label]));

function CreateScheduleForm() {
  const { account } = useAuth();
  const queryClient = useQueryClient();
  const [branch, setBranch] = useState("");
  const [doctor, setDoctor] = useState("");
  const [weekday, setWeekday] = useState("0");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [slotMinutes, setSlotMinutes] = useState("30");
  const [error, setError] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("doctor_schedules.create", isOnline());
      return api<DoctorSchedule>("/doctor-schedules/", {
        method: "POST",
        body: JSON.stringify({
          branch,
          doctor,
          weekday: Number(weekday),
          start_time: `${startTime}:00`,
          end_time: `${endTime}:00`,
          slot_minutes: Number(slotMinutes),
        }),
      });
    },
    onSuccess: async () => {
      setDoctor("");
      setError(null);
      toast.success("Schedule created.");
      await queryClient.invalidateQueries({ queryKey: ["doctor-schedules"] });
    },
    onError: (caught) => setError(caught),
  });

  if (!account || !allowed(account.permissions, "appointments.update")) {
    return null;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (
      !validateForm(
        scheduleCreateSchema,
        {
          branch,
          doctor,
          weekday,
          start_time: startTime,
          end_time: endTime,
          slot_minutes: slotMinutes,
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
        <CardTitle>Add doctor schedule</CardTitle>
        <CardDescription>Define recurring availability for appointment booking.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
          <BranchSelect id="schedule_branch" value={branch} onValueChange={setBranch} />
          <DoctorSelect id="schedule_doctor" value={doctor} onValueChange={setDoctor} />
          <div className="space-y-2">
            <Label htmlFor="schedule_weekday">Weekday</Label>
            <Select value={weekday} onValueChange={setWeekday}>
              <SelectTrigger id="schedule_weekday" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {weekdayOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="schedule_slot">Slot minutes</Label>
            <Input
              id="schedule_slot"
              inputMode="numeric"
              value={slotMinutes}
              onChange={(event) => setSlotMinutes(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="schedule_start">Start time</Label>
            <Input id="schedule_start" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="schedule_end">End time</Label>
            <Input id="schedule_end" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Create schedule"}
            </Button>
          </div>
          <div className="md:col-span-2">
            <FormFieldError error={error} name="doctor" />
            <FormError error={error} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function SchedulesScreen() {
  const { account } = useAuth();
  const canManage = Boolean(account && allowed(account.permissions, "appointments.update"));

  return (
    <RequirePermission permission="appointments.view" title="Schedules">
      <div className="space-y-6">
        <CreateScheduleForm />
        <RecordBrowser<DoctorSchedule>
          title="Doctor schedules"
          resource="doctor-schedules"
          path="/doctor-schedules/"
          emptyLabel="schedules"
          columns={[
            {
              key: "weekday",
              header: "Day",
              cell: (row) => weekdayLabel[String(row.weekday)] ?? String(row.weekday),
            },
            { key: "start", header: "Start", cell: (row) => row.start_time.slice(0, 5) },
            { key: "end", header: "End", cell: (row) => row.end_time.slice(0, 5) },
            { key: "slot", header: "Slot", cell: (row) => `${row.slot_minutes} min` },
            {
              key: "status",
              header: "Status",
              cell: (row) => <StatusText value={row.is_active ? "active" : "inactive"} />,
            },
            {
              key: "actions",
              header: "Actions",
              cell: (row) =>
                canManage ? (
                  <ToggleActiveButton
                    path={`/doctor-schedules/${row.id}/`}
                    active={row.is_active}
                    resource="doctor-schedules"
                    label="Schedule"
                  />
                ) : (
                  "—"
                ),
            },
          ]}
        />
      </div>
    </RequirePermission>
  );
}
