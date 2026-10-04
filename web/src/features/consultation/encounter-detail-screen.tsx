"use client";

import { StatusText } from "@/components/record-browser";
import { PrintRecordButton } from "@/components/print/print-record-button";
import { DetailField, DetailGrid, DetailSection, DetailTable } from "@/components/detail-fields";
import { DetailLayout } from "@/components/detail-layout";
import { DetailPageState } from "@/components/detail-page-state";
import { DoctorLabel, PatientLink, RecordLink } from "@/components/record-link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ConsultationPatientBanner,
  VitalSnapshot,
  computeBmi,
} from "@/features/consultation/consultation-chart";
import { EncounterWritePanel } from "@/features/consultation/encounter-writes";
import { RequirePermission } from "@/features/access/require-permission";
import { useDetailQuery, useRelatedListQuery } from "@/hooks/use-detail-query";
import { useVitalUnits } from "@/hooks/use-vital-units";
import { DEFAULT_VITAL_UNITS, vitalHistoryTableColumns } from "@/lib/vitals/units";
import { withQuery } from "@/lib/api/client";
import type { EncounterHistory, LabOrder, PatientProfile, Prescription } from "@/lib/api/types";
import { formatWhen } from "@/lib/utils";

export function EncounterDetailScreen({ encounterId }: { encounterId: string }) {
  return (
    <RequirePermission permission="encounters.view" title="Consultation">
      <EncounterDetail encounterId={encounterId} />
    </RequirePermission>
  );
}

function EncounterDetail({ encounterId }: { encounterId: string }) {
  const vitalUnitsQuery = useVitalUnits();
  const vitalUnits = vitalUnitsQuery.data ?? DEFAULT_VITAL_UNITS;
  const query = useDetailQuery<EncounterHistory>("encounters", `/encounters/${encounterId}/history/`);

  const patientQuery = useDetailQuery<PatientProfile>(
    "patients",
    query.data?.encounter ? `/patients/${query.data.encounter.patient}/profile/` : null,
  );

  const prescriptionsQuery = useRelatedListQuery<Prescription>(
    "prescriptions",
    query.data?.encounter ? withQuery("/prescriptions/", { encounter: query.data.encounter.id }) : null,
  );
  const labOrdersQuery = useRelatedListQuery<LabOrder>(
    "lab-orders",
    query.data?.encounter ? withQuery("/lab-orders/", { encounter: query.data.encounter.id }) : null,
  );

  const state = (
    <DetailPageState
      title="Consultation"
      isLoading={query.isLoading}
      error={query.error}
      onRetry={() => void query.refetch()}
    />
  );

  if (query.isLoading || query.error || !query.data?.encounter) {
    return state;
  }

  const { encounter, vitals, symptoms, diagnoses, notes, treatment_plans: plans, follow_ups: followUps } =
    query.data;
  const sortedVitals = [...vitals].sort(
    (left, right) => new Date(right.recorded_at).getTime() - new Date(left.recorded_at).getTime(),
  );
  const patientProfile = patientQuery.data;
  const refetchAll = () => {
    void query.refetch();
    void patientQuery.refetch();
    void prescriptionsQuery.refetch();
    void labOrdersQuery.refetch();
  };

  return (
    <DetailLayout
      breadcrumbs={[
        { label: "Dashboard", href: "/" },
        { label: "Consultations", href: "/consultation" },
        { label: patientProfile?.patient.full_name ?? formatWhen(encounter.started_at) },
      ]}
      title={patientProfile?.patient.full_name ?? "Consultation"}
      description={`Electronic medical record · ${encounter.status.replace(/_/g, " ")} · ${formatWhen(encounter.started_at)}`}
      actions={
        <PrintRecordButton href={`/consultation/${encounterId}/print?auto=1`} label="Print medical record" />
      }
    >
      {patientProfile ? (
        <ConsultationPatientBanner patient={patientProfile.patient} profile={patientProfile} encounter={encounter} />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Tabs defaultValue="overview" className="min-w-0">
          <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="vitals">Vitals</TabsTrigger>
            <TabsTrigger value="assessment">Assessment</TabsTrigger>
            <TabsTrigger value="notes">Notes & plan</TabsTrigger>
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="history">Medical history</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6 space-y-6">
            <DetailSection title="Visit summary">
              <DetailGrid>
                <DetailField label="Status" value={<StatusText value={encounter.status} />} />
                <DetailField label="Started" value={formatWhen(encounter.started_at)} />
                <DetailField label="Completed" value={formatWhen(encounter.completed_at)} />
                <DetailField label="Patient" value={<PatientLink id={encounter.patient} />} />
                <DetailField
                  label="Doctor"
                  value={<DoctorLabel id={encounter.doctor} fullName={encounter.doctor_full_name} />}
                />
                <DetailField
                  label="Appointment"
                  value={<RecordLink href={`/appointments/${encounter.appointment}`}>Open appointment</RecordLink>}
                />
              </DetailGrid>
            </DetailSection>

            <DetailSection title="Latest vitals">
              <VitalSnapshot vitals={sortedVitals} />
            </DetailSection>

            <DetailSection title="This visit at a glance">
              <DetailGrid>
                <DetailField label="Symptoms" value={symptoms.length} />
                <DetailField label="Diagnoses" value={diagnoses.length} />
                <DetailField label="Clinical notes" value={notes.length} />
                <DetailField label="Treatment plans" value={plans.length} />
                <DetailField label="Prescriptions" value={prescriptionsQuery.data?.length ?? 0} />
                <DetailField label="Lab orders" value={labOrdersQuery.data?.length ?? 0} />
              </DetailGrid>
            </DetailSection>
          </TabsContent>

          <TabsContent value="vitals" className="mt-6 space-y-6">
            <DetailSection title="Vital signs">
              <DetailTable
                emptyLabel="No vitals recorded."
                rows={sortedVitals}
                columns={[
                  { key: "when", header: "Recorded", cell: (row) => formatWhen(String(row.recorded_at)) },
                  ...vitalHistoryTableColumns(vitalUnits),
                  {
                    key: "bmi",
                    header: "BMI",
                    cell: (row) =>
                      computeBmi(
                        row.weight_kg != null ? String(row.weight_kg) : null,
                        row.height_cm != null ? String(row.height_cm) : null,
                      ) ?? "—",
                  },
                ]}
              />
            </DetailSection>
          </TabsContent>

          <TabsContent value="assessment" className="mt-6 space-y-6">
            <DetailSection title="Presenting symptoms">
              <DetailTable
                emptyLabel="No symptoms recorded."
                rows={symptoms}
                columns={[
                  { key: "when", header: "Recorded", cell: (row) => formatWhen(String(row.recorded_at)) },
                  { key: "description", header: "Symptom", cell: (row) => String(row.description) },
                ]}
              />
            </DetailSection>

            <DetailSection title="Diagnoses">
              <DetailTable
                emptyLabel="No diagnoses recorded."
                rows={diagnoses}
                columns={[
                  { key: "code", header: "Code", cell: (row) => String(row.code) },
                  { key: "description", header: "Description", cell: (row) => String(row.description) },
                  { key: "when", header: "Recorded", cell: (row) => formatWhen(String(row.recorded_at)) },
                ]}
              />
            </DetailSection>
          </TabsContent>

          <TabsContent value="notes" className="mt-6 space-y-6">
            <DetailSection title="Clinical notes">
              {notes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No notes recorded.</p>
              ) : (
                <ul className="space-y-3">
                  {notes.map((row) => (
                    <li key={row.id} className="rounded-lg border bg-muted/20 px-4 py-3">
                      <p className="text-xs text-muted-foreground">{formatWhen(String(row.recorded_at))}</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{row.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </DetailSection>

            <DetailSection title="Treatment plan">
              <DetailTable
                emptyLabel="No treatment plans recorded."
                rows={plans}
                columns={[
                  { key: "title", header: "Title", cell: (row) => String(row.title) },
                  { key: "details", header: "Details", cell: (row) => String(row.details) },
                  { key: "when", header: "Recorded", cell: (row) => formatWhen(String(row.recorded_at)) },
                ]}
              />
            </DetailSection>

            <DetailSection title="Follow-up">
              <DetailTable
                emptyLabel="No follow-ups scheduled."
                rows={followUps}
                columns={[
                  { key: "date", header: "Follow-up date", cell: (row) => String(row.follow_up_on) },
                  { key: "note", header: "Note", cell: (row) => String(row.note || "—") },
                  { key: "when", header: "Recorded", cell: (row) => formatWhen(String(row.recorded_at)) },
                ]}
              />
            </DetailSection>
          </TabsContent>

          <TabsContent value="orders" className="mt-6 space-y-6">
            <DetailSection title="Prescriptions">
              {prescriptionsQuery.data && prescriptionsQuery.data.length > 0 ? (
                <ul className="space-y-2 text-sm">
                  {prescriptionsQuery.data.map((prescription) => (
                    <li key={prescription.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
                      <span>
                        <StatusText value={prescription.status} /> · {formatWhen(prescription.created_at)}
                      </span>
                      <div className="flex flex-wrap gap-2">
                        <PrintRecordButton
                          href={`/prescriptions/${prescription.id}/print?auto=1`}
                          label="Print"
                        />
                        <RecordLink href={`/prescriptions/${prescription.id}`}>Open</RecordLink>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No prescriptions for this visit.</p>
              )}
            </DetailSection>

            <DetailSection title="Laboratory orders">
              {labOrdersQuery.data && labOrdersQuery.data.length > 0 ? (
                <ul className="space-y-2 text-sm">
                  {labOrdersQuery.data.map((order) => (
                    <li key={order.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                      <span>
                        <StatusText value={order.status} /> · {formatWhen(order.created_at)}
                      </span>
                      <RecordLink href={`/laboratory/${order.id}`}>Open</RecordLink>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No lab orders for this visit.</p>
              )}
            </DetailSection>
          </TabsContent>

          <TabsContent value="history" className="mt-6 space-y-6">
            {patientProfile ? (
              <>
                <DetailSection title="Allergies">
                  <DetailTable
                    emptyLabel="No allergies on file."
                    rows={patientProfile.allergies.filter((row) => row.status === "active")}
                    columns={[
                      { key: "substance", header: "Substance", cell: (row) => String(row.substance) },
                      { key: "reaction", header: "Reaction", cell: (row) => String(row.reaction ?? "—") },
                      {
                        key: "severity",
                        header: "Severity",
                        cell: (row) => <StatusText value={String(row.severity)} />,
                      },
                    ]}
                  />
                </DetailSection>

                <DetailSection title="Past medical history">
                  <DetailTable
                    emptyLabel="No medical history on file."
                    rows={patientProfile.medical_history.filter((row) => row.status === "active")}
                    columns={[
                      { key: "title", header: "Condition", cell: (row) => String(row.title) },
                      { key: "details", header: "Details", cell: (row) => String(row.details ?? "—") },
                      { key: "onset", header: "Onset", cell: (row) => String(row.onset_date ?? "—") },
                    ]}
                  />
                </DetailSection>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Loading patient history…</p>
            )}
          </TabsContent>
        </Tabs>

        <aside className="min-w-0 xl:sticky xl:top-4 xl:z-10 xl:max-h-[calc(100dvh-5.5rem)] xl:self-start xl:overflow-y-auto xl:overscroll-y-contain">
          <EncounterWritePanel encounter={encounter} layout="sidebar" onUpdated={refetchAll} />
        </aside>
      </div>
    </DetailLayout>
  );
}
