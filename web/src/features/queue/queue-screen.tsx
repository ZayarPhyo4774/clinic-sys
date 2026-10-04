"use client";

import { RecordBrowser, StatusText } from "@/components/record-browser";
import { DoctorLabel, PatientLink } from "@/components/record-link";
import { allowed } from "@/features/access/navigation";
import { RequirePermission } from "@/features/access/require-permission";
import { QueueActions } from "@/features/queue/queue-actions";
import { useAuth } from "@/features/auth/auth-provider";
import type { QueueEntry } from "@/lib/api/types";

export function QueueScreen() {
  return (
    <RequirePermission permission="appointments.view" title="Queue">
      <QueueList />
    </RequirePermission>
  );
}

function QueueList() {
  const { account } = useAuth();
  const canUpdate = Boolean(account && allowed(account.permissions, "appointments.update"));
  const columns = [
    { key: "position", header: "Position", cell: (row: QueueEntry) => row.position },
    { key: "date", header: "Service date", cell: (row: QueueEntry) => row.service_date },
    { key: "status", header: "Status", cell: (row: QueueEntry) => <StatusText value={row.status} /> },
    {
      key: "appointment",
      header: "Appointment",
      cell: (row: QueueEntry) => <StatusText value={row.appointment_status} />,
    },
    { key: "patient", header: "Patient", cell: (row: QueueEntry) => <PatientLink id={row.patient} /> },
    {
      key: "doctor",
      header: "Doctor",
      cell: (row: QueueEntry) => <DoctorLabel id={row.doctor} fullName={row.doctor_full_name} />,
    },
  ];
  if (canUpdate) {
    columns.push({
      key: "actions",
      header: "Actions",
      cell: (row: QueueEntry) => (
        <QueueActions
          entryId={row.id}
          status={row.status}
          appointmentId={row.appointment}
          appointmentStatus={row.appointment_status}
        />
      ),
    });
  }

  return (
    <RecordBrowser<QueueEntry>
      title="Queue"
      resource="queue"
      path="/queue-entries/"
      emptyLabel="queue entries"
      rowHref={(row) => `/appointments/${row.appointment}`}
      rowLabel={(row) => `Queue entry ${row.position}, ${row.status}`}
      columns={columns}
    />
  );
}
