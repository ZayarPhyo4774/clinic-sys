"use client";

import { RecordBrowser, StatusText } from "@/components/record-browser";
import { RequirePermission } from "@/features/access/require-permission";
import { RegisterPatient } from "@/features/patients/register-patient";
import type { Patient } from "@/lib/api/types";
import { formatPatientAgeLabel, formatPatientDobLabel } from "@/lib/patients/age";

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
          {
            key: "age",
            header: "Age",
            cell: (row) => formatPatientAgeLabel(row),
          },
          {
            key: "dob",
            header: "Birth date",
            cell: (row) => formatPatientDobLabel(row),
          },
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
