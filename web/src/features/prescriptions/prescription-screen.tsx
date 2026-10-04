"use client";

import { useState } from "react";

import { DoctorLabel, PatientLink, RecordLink } from "@/components/record-link";
import { RecordBrowser, StatusText } from "@/components/record-browser";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RequirePermission } from "@/features/access/require-permission";
import type { Prescription } from "@/lib/api/types";
import { formatWhen, shortId } from "@/lib/utils";

const prescriptionStatuses = [
  { value: "__all__", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "partially_dispensed", label: "Partially dispensed" },
  { value: "dispensed", label: "Dispensed" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export function PrescriptionsScreen() {
  const [status, setStatus] = useState<string>("__all__");

  return (
    <RequirePermission permission="prescriptions.view" title="Prescriptions">
      <RecordBrowser<Prescription>
        title="Prescriptions"
        resource="prescriptions"
        path="/prescriptions/"
        emptyLabel="prescriptions"
        listParams={{ status: status === "__all__" ? undefined : status }}
        toolbar={
          <div className="flex items-end gap-2">
            <div className="space-y-2">
              <Label htmlFor="rx_status">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="rx_status" className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {prescriptionStatuses.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        }
        rowHref={(row) => `/prescriptions/${row.id}`}
        columns={[
          { key: "status", header: "Status", cell: (row) => <StatusText value={row.status} /> },
          { key: "created", header: "Created", cell: (row) => formatWhen(row.created_at) },
          { key: "patient", header: "Patient", cell: (row) => <PatientLink id={row.patient} /> },
          {
            key: "doctor",
            header: "Doctor",
            cell: (row) => <DoctorLabel id={row.doctor} fullName={row.doctor_full_name} />,
          },
          {
            key: "encounter",
            header: "Encounter",
            cell: (row) => (
              <RecordLink href={`/consultation/${row.encounter}`}>{shortId(row.encounter)}</RecordLink>
            ),
          },
        ]}
      />
    </RequirePermission>
  );
}
