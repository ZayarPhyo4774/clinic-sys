"use client";

import { RecordBrowser, StatusText } from "@/components/record-browser";
import { RequirePermission } from "@/features/access/require-permission";
import { RegisterPatient } from "@/features/patients/register-patient";
import type { Patient } from "@/lib/api/types";

export function PatientsScreen() {
  return (
    <RequirePermission permission="patients.view" title="Patients">
      <RecordBrowser<Patient>
        title="Patients"
        resource="patients"
        path="/patients/"
        emptyLabel="patients"
        rowHref={(row) => `/patients/${row.id}`}
        rowLabel={(row) => `Patient ${row.full_name}`}
        toolbar={<RegisterPatient />}
        columns={[
          { key: "number", header: "Number", cell: (row) => row.patient_number },
          { key: "name", header: "Name", cell: (row) => row.full_name },
          { key: "dob", header: "Date of birth", cell: (row) => row.date_of_birth },
          { key: "sex", header: "Sex", cell: (row) => row.sex },
          {
            key: "active",
            header: "Record",
            cell: (row) => <StatusText value={row.is_active ? "active" : "inactive"} />,
          },
        ]}
      />
    </RequirePermission>
  );
}
