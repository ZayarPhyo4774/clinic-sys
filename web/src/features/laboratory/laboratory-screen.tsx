"use client";

import { DoctorLabel, PatientLink } from "@/components/record-link";
import { RecordBrowser, StatusText } from "@/components/record-browser";
import { RequirePermission } from "@/features/access/require-permission";
import { CreateLabTestForm } from "@/features/laboratory/lab-test-writes";
import type { LabOrder, LabTest } from "@/lib/api/types";
import { formatWhen } from "@/lib/utils";

export function LaboratoryScreen() {
  return (
    <RequirePermission permission="laboratory.view" title="Laboratory">
      <div className="space-y-6">
        <CreateLabTestForm />
        <RecordBrowser<LabTest>
          title="Test catalog"
          description="Master list of tests available for ordering."
          resource="lab-tests"
          path="/lab-tests/"
          emptyLabel="lab tests"
          rowHref={(row) => `/laboratory/tests/${row.id}`}
          columns={[
            { key: "name", header: "Name", cell: (row) => row.name },
            { key: "code", header: "Code", cell: (row) => row.code },
            { key: "specimen", header: "Specimen", cell: (row) => row.specimen },
            { key: "unit", header: "Unit", cell: (row) => row.unit },
            {
              key: "active",
              header: "Status",
              cell: (row) => <StatusText value={row.is_active ? "active" : "inactive"} />,
            },
          ]}
        />
        <RecordBrowser<LabOrder>
          title="Lab orders"
          resource="lab-orders"
          path="/lab-orders/"
          emptyLabel="lab orders"
          rowHref={(row) => `/laboratory/${row.id}`}
          columns={[
            { key: "status", header: "Status", cell: (row) => <StatusText value={row.status} /> },
            { key: "created", header: "Ordered", cell: (row) => formatWhen(row.created_at) },
            { key: "reported", header: "Reported", cell: (row) => formatWhen(row.reported_at) },
            { key: "patient", header: "Patient", cell: (row) => <PatientLink id={row.patient} /> },
            {
              key: "doctor",
              header: "Doctor",
              cell: (row) => <DoctorLabel id={row.doctor} fullName={row.doctor_full_name} />,
            },
          ]}
        />
      </div>
    </RequirePermission>
  );
}
