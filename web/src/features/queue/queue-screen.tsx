"use client";

import { RecordBrowser, StatusText } from "@/components/record-browser";
import { DoctorLabel, PatientLink } from "@/components/record-link";
import { allowed } from "@/features/access/navigation";
import { RequirePermission } from "@/features/access/require-permission";
import { QueueActions } from "@/features/queue/queue-actions";
import { TriageStatusBadge } from "@/features/queue/triage-status";
import { canOpenTriage, queueActionsForRole } from "@/features/queue/actions";
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
  const permissions = account?.permissions ?? [];
  const canUpdate = Boolean(account && allowed(account.permissions, "appointments.update"));
  const canTriage = Boolean(account && (canOpenTriage({ status: "waiting" }, permissions) || permissions.includes("vitals.record")));
  const columns = [
    { key: "position", header: "Position", cell: (row: QueueEntry) => row.position },
    { key: "date", header: "Service date", cell: (row: QueueEntry) => row.service_date },
    { key: "status", header: "Status", cell: (row: QueueEntry) => <StatusText value={row.status} /> },
    {
      key: "triage",
      header: "Triage",
      cell: (row: QueueEntry) => <TriageStatusBadge entry={row} />,
    },
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
  if (canUpdate || canTriage) {
    columns.push({
      key: "actions",
      header: "Actions",
      cell: (row: QueueEntry) => {
        const hasDoctorActions = queueActionsForRole(row.status, permissions).length > 0;
        const hasTriageAction = canOpenTriage(row, permissions);
        const hasConsultationLink =
          Boolean(row.encounter) &&
          (row.status === "in_service" || row.appointment_status === "in_consultation") &&
          allowed(permissions, "encounters.view");
        if (!hasDoctorActions && !hasTriageAction && !hasConsultationLink) {
          return <span className="text-xs text-muted-foreground">No actions</span>;
        }
        return <QueueActions entry={row} />;
      },
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
      refetchInterval={15_000}
    />
  );
}
