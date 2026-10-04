"use client";

import { DetailPageState } from "@/components/detail-page-state";
import {
  PrintDocument,
  PrintHeader,
  PrintMetaGrid,
  PrintSection,
  PrintSignatureBlock,
  PrintTable,
  PrintToolbar,
} from "@/components/print/print-document";
import { PatientAllergyAlert, activeAllergies } from "@/components/patient-allergy-alert";
import { formatSex, patientAge } from "@/features/consultation/consultation-chart";
import { formatMedicineUnit, resolvePrescriptionItemUnit } from "@/features/prescriptions/prescription-utils";
import { useMedicineLabelMap } from "@/features/prescriptions/use-medicine-labels";
import { RequirePermission } from "@/features/access/require-permission";
import { useDetailQuery, useRelatedListQuery } from "@/hooks/use-detail-query";
import type { Patient, PatientProfile, Prescription, PrescriptionItem } from "@/lib/api/types";
import { formatWhen, shortId } from "@/lib/utils";

export function PrescriptionPrintScreen({
  prescriptionId,
  autoPrint = false,
}: {
  prescriptionId: string;
  autoPrint?: boolean;
}) {
  return (
    <RequirePermission permission="prescriptions.view" title="Prescription">
      <PrescriptionPrint prescriptionId={prescriptionId} autoPrint={autoPrint} />
    </RequirePermission>
  );
}

function PrescriptionPrint({ prescriptionId, autoPrint }: { prescriptionId: string; autoPrint: boolean }) {
  const query = useDetailQuery<Prescription>("prescriptions", `/prescriptions/${prescriptionId}/`);
  const itemsQuery = useRelatedListQuery<PrescriptionItem>(
    "prescription-items",
    `/prescriptions/${prescriptionId}/items/`,
  );
  const patientQuery = useDetailQuery<Patient>(
    "patients",
    query.data ? `/patients/${query.data.patient}/` : null,
  );
  const profileQuery = useDetailQuery<PatientProfile>(
    "patients",
    query.data ? `/patients/${query.data.patient}/profile/` : null,
  );
  const { labelFor, unitFor, isLoading: medicinesLoading } = useMedicineLabelMap();

  const items = itemsQuery.data ?? [];
  const loading =
    query.isLoading || itemsQuery.isLoading || patientQuery.isLoading || profileQuery.isLoading || medicinesLoading;
  const error = query.error ?? itemsQuery.error ?? patientQuery.error ?? profileQuery.error;

  if (loading || error || !query.data) {
    return (
      <>
        <PrintToolbar
          backHref={`/prescriptions/${prescriptionId}`}
          backLabel="Back to prescription"
          title="Prescription"
          autoPrint={autoPrint}
          ready={false}
        />
        <DetailPageState
          title="Prescription"
          isLoading={loading}
          error={error}
          onRetry={() => {
            void query.refetch();
            void itemsQuery.refetch();
            void patientQuery.refetch();
            void profileQuery.refetch();
          }}
        />
      </>
    );
  }

  const prescription = query.data;
  const patient = patientQuery.data;
  const doctorName = prescription.doctor_full_name?.trim() || "Prescriber";
  const age = patient ? patientAge(patient.date_of_birth) : null;
  const allergies = profileQuery.data ? activeAllergies(profileQuery.data.allergies) : [];

  return (
    <>
      <PrintToolbar
        backHref={`/prescriptions/${prescriptionId}`}
        backLabel="Back to prescription"
        title="Prescription slip"
        autoPrint={autoPrint}
        ready
      />
      <PrintDocument>
        <PrintHeader
          clinicName="ClinicSys Pharmacy"
          documentTitle="Prescription"
          documentRef={shortId(prescription.id)}
        />

        <div className="mt-4 flex items-center gap-3">
          <span className="text-4xl font-serif leading-none">℞</span>
          <p className="text-sm text-neutral-600">Dispense only as directed below.</p>
        </div>

        <PrintSection title="Patient">
          <PrintMetaGrid
            rows={[
              { label: "Name", value: patient?.full_name ?? "—" },
              { label: "Patient No.", value: patient?.patient_number ?? "—" },
              {
                label: "Age / Sex",
                value: patient ? `${age ?? "—"} years · ${formatSex(patient.sex)}` : "—",
              },
              { label: "Prescribed", value: formatWhen(prescription.created_at) },
              {
                label: "Allergies",
                value:
                  allergies.length > 0
                    ? allergies.map((row) => `${row.substance}${row.reaction ? ` (${row.reaction})` : ""}`).join(" · ")
                    : "None recorded",
              },
            ]}
          />
        </PrintSection>

        <PrintSection title="Prescriber">
          <PrintMetaGrid
            rows={[
              { label: "Doctor", value: doctorName },
              { label: "Status", value: prescription.status.replace(/_/g, " ") },
            ]}
          />
        </PrintSection>

        <PrintSection title="Medications">
          <PrintTable
            compact
            headers={["Medicine", "Dosage", "Frequency", "Duration", "Qty", "UoM"]}
            rows={items.map((item) => {
              const unit = resolvePrescriptionItemUnit(item, unitFor);
              return [
                labelFor(item.medicine),
                item.dosage,
                item.frequency || "—",
                item.duration_days ? `${item.duration_days} days` : "—",
                item.quantity,
                unit ? formatMedicineUnit(unit, item.quantity) : "—",
              ];
            })}
          />
        </PrintSection>

        <PrintSignatureBlock doctorName={doctorName} />
      </PrintDocument>
    </>
  );
}
