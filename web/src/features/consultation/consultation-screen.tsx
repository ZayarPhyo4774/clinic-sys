"use client";

import { DoctorLabel, PatientLink } from "@/components/record-link";
import { RecordBrowser, StatusText } from "@/components/record-browser";
import { RequirePermission } from "@/features/access/require-permission";
import type { Encounter } from "@/lib/api/types";
import { formatWhen } from "@/lib/utils";

export function ConsultationScreen({ patientId }: { patientId?: string }) {
  return (
    <RequirePermission permission="encounters.view" title="Consultation">
      <RecordBrowser<Encounter>
        title={patientId ? "Patient consultations" : "Consultations"}
        description={
          patientId
            ? "No consultation has been started for this patient yet. Start one from an appointment."
            : undefined
        }
        resource="encounters"
        path="/encounters/"
        listParams={patientId ? { patient: patientId } : undefined}
        emptyLabel="consultations"
        rowHref={(row) => `/consultation/${row.id}`}
        columns={[
          { key: "status", header: "Status", cell: (row) => <StatusText value={row.status} /> },
          { key: "started", header: "Started", cell: (row) => formatWhen(row.started_at) },
          { key: "completed", header: "Completed", cell: (row) => formatWhen(row.completed_at) },
          { key: "patient", header: "Patient", cell: (row) => <PatientLink id={row.patient} /> },
          {
            key: "doctor",
            header: "Doctor",
            cell: (row) => <DoctorLabel id={row.doctor} fullName={row.doctor_full_name} />,
          },
        ]}
      />
    </RequirePermission>
  );
}
