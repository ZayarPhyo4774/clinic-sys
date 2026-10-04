"use client";

import { DoctorLabel, PatientLink } from "@/components/record-link";
import { RecordBrowser, StatusText } from "@/components/record-browser";
import { BookAppointment } from "@/features/appointments/book-appointment";
import { RequirePermission } from "@/features/access/require-permission";
import type { Appointment } from "@/lib/api/types";
import { formatWhen } from "@/lib/utils";

export function AppointmentsScreen() {
  return (
    <RequirePermission permission="appointments.view" title="Appointments">
      <RecordBrowser<Appointment>
        title="Appointments"
        resource="appointments"
        path="/appointments/"
        emptyLabel="appointments"
        toolbar={<BookAppointment />}
        rowHref={(row) => `/appointments/${row.id}`}
        rowLabel={(row) => `Appointment starting ${formatWhen(row.starts_at)}`}
        columns={[
          { key: "when", header: "Starts", cell: (row) => formatWhen(row.starts_at) },
          { key: "ends", header: "Ends", cell: (row) => formatWhen(row.ends_at) },
          { key: "status", header: "Status", cell: (row) => <StatusText value={row.status} /> },
          { key: "patient", header: "Patient", cell: (row) => <PatientLink id={row.patient} /> },
          {
            key: "doctor",
            header: "Doctor",
            cell: (row) => <DoctorLabel id={row.doctor} fullName={row.doctor_full_name} />,
          },
          { key: "reason", header: "Reason", cell: (row) => row.visit_reason || "—" },
        ]}
      />
    </RequirePermission>
  );
}
