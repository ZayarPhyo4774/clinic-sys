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
import { formatSex, patientAge } from "@/features/consultation/consultation-chart";
import { RequirePermission } from "@/features/access/require-permission";
import { useDetailQuery } from "@/hooks/use-detail-query";
import { useVitalUnits } from "@/hooks/use-vital-units";
import { DEFAULT_VITAL_UNITS, vitalPrintHeaders, vitalPrintRow } from "@/lib/vitals/units";
import type { EncounterHistory, PatientProfile } from "@/lib/api/types";
import { formatWhen, shortId } from "@/lib/utils";

export function ConsultationPrintScreen({
  encounterId,
  autoPrint = false,
}: {
  encounterId: string;
  autoPrint?: boolean;
}) {
  return (
    <RequirePermission permission="encounters.view" title="Consultation record">
      <ConsultationPrint encounterId={encounterId} autoPrint={autoPrint} />
    </RequirePermission>
  );
}

function ConsultationPrint({ encounterId, autoPrint }: { encounterId: string; autoPrint: boolean }) {
  const vitalUnitsQuery = useVitalUnits();
  const vitalUnits = vitalUnitsQuery.data ?? DEFAULT_VITAL_UNITS;
  const historyQuery = useDetailQuery<EncounterHistory>("encounters", `/encounters/${encounterId}/history/`);
  const patientQuery = useDetailQuery<PatientProfile>(
    "patients",
    historyQuery.data?.encounter ? `/patients/${historyQuery.data.encounter.patient}/profile/` : null,
  );

  const loading = historyQuery.isLoading || patientQuery.isLoading;
  const error = historyQuery.error ?? patientQuery.error;

  if (loading || error || !historyQuery.data?.encounter) {
    return (
      <>
        <PrintToolbar
          backHref={`/consultation/${encounterId}`}
          backLabel="Back to consultation"
          title="Medical record"
          autoPrint={autoPrint}
          ready={false}
        />
        <DetailPageState
          title="Medical record"
          isLoading={loading}
          error={error}
          onRetry={() => {
            void historyQuery.refetch();
            void patientQuery.refetch();
          }}
        />
      </>
    );
  }

  const { encounter, vitals, symptoms, diagnoses, notes, treatment_plans: plans, follow_ups: followUps } =
    historyQuery.data;
  const patient = patientQuery.data?.patient;
  const allergies = patientQuery.data?.allergies.filter((row) => row.status === "active") ?? [];
  const history = patientQuery.data?.medical_history.filter((row) => row.status === "active") ?? [];
  const doctorName = encounter.doctor_full_name?.trim() || "Attending physician";
  const age = patient ? patientAge(patient.date_of_birth) : null;

  return (
    <>
      <PrintToolbar
        backHref={`/consultation/${encounterId}`}
        backLabel="Back to consultation"
        title="Medical record book"
        autoPrint={autoPrint}
        ready
      />
      <PrintDocument>
        <PrintHeader
          clinicName="ClinicSys Medical Record"
          documentTitle="Outpatient Consultation Record"
          documentRef={shortId(encounter.id)}
        />

        <PrintSection title="Patient">
          <PrintMetaGrid
            rows={[
              { label: "Name", value: patient?.full_name ?? "—" },
              { label: "Patient No.", value: patient?.patient_number ?? "—" },
              {
                label: "Age / Sex",
                value: patient
                  ? `${age ?? "—"} years · ${formatSex(patient.sex)}`
                  : "—",
              },
              { label: "Date of birth", value: patient?.date_of_birth ?? "—" },
            ]}
          />
        </PrintSection>

        <PrintSection title="Visit">
          <PrintMetaGrid
            rows={[
              { label: "Consultation date", value: formatWhen(encounter.started_at) },
              { label: "Completed", value: formatWhen(encounter.completed_at) },
              { label: "Status", value: encounter.status.replace(/_/g, " ") },
              { label: "Doctor", value: doctorName },
            ]}
          />
        </PrintSection>

        {allergies.length > 0 ? (
          <PrintSection title="Allergies">
            <PrintTable
              headers={["Substance", "Reaction", "Severity"]}
              rows={allergies.map((row) => [row.substance, row.reaction ?? "—", row.severity])}
            />
          </PrintSection>
        ) : null}

        {history.length > 0 ? (
          <PrintSection title="Past medical history">
            <PrintTable
              headers={["Condition", "Details", "Onset"]}
              rows={history.map((row) => [row.title, row.details ?? "—", row.onset_date ?? "—"])}
            />
          </PrintSection>
        ) : null}

        <PrintSection title="Vital signs">
          <PrintTable
            headers={["Recorded", ...vitalPrintHeaders(vitalUnits)]}
            rows={[...vitals]
              .sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime())
              .map((row) => [formatWhen(row.recorded_at), ...vitalPrintRow(row, vitalUnits)])}
          />
        </PrintSection>

        <PrintSection title="Presenting symptoms">
          <PrintTable
            headers={["Recorded", "Symptom"]}
            rows={symptoms.map((row) => [formatWhen(row.recorded_at), row.description])}
          />
        </PrintSection>

        <PrintSection title="Diagnosis">
          <PrintTable
            headers={["Code", "Description", "Recorded"]}
            rows={diagnoses.map((row) => [row.code, row.description, formatWhen(row.recorded_at)])}
          />
        </PrintSection>

        <PrintSection title="Clinical notes">
          {notes.length === 0 ? (
            <p className="text-sm text-neutral-600">None recorded.</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {notes.map((row) => (
                <li key={row.id} className="rounded border border-neutral-300 p-3">
                  <p className="text-xs text-neutral-600">{formatWhen(row.recorded_at)}</p>
                  <p className="mt-1 whitespace-pre-wrap">{row.body}</p>
                </li>
              ))}
            </ul>
          )}
        </PrintSection>

        <PrintSection title="Treatment plan">
          <PrintTable
            headers={["Title", "Details", "Recorded"]}
            rows={plans.map((row) => [row.title, row.details, formatWhen(row.recorded_at)])}
          />
        </PrintSection>

        <PrintSection title="Follow-up">
          <PrintTable
            headers={["Date", "Note"]}
            rows={followUps.map((row) => [row.follow_up_on, row.note || "—"])}
          />
        </PrintSection>

        <PrintSignatureBlock doctorName={doctorName} />
      </PrintDocument>
    </>
  );
}
