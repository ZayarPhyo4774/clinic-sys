"use client";

import { StatusText } from "@/components/record-browser";
import { PrintRecordButton } from "@/components/print/print-record-button";
import { VitalsGridReadonly } from "@/components/vitals/vitals-grid";
import { DetailField, DetailGrid, DetailSection, DetailTable } from "@/components/detail-fields";
import { DetailLayout } from "@/components/detail-layout";
import { DetailPageState } from "@/components/detail-page-state";
import { PanelTabs, PanelTabsContent, PanelTabsList, PanelTabsTrigger } from "@/components/panel-tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DoctorLabel, PatientLink, RecordLink } from "@/components/record-link";
import { ConsultationPatientBanner } from "@/features/consultation/consultation-chart";
import { CompleteEncounterButton, EncounterWritePanel } from "@/features/consultation/encounter-writes";
import { PatientVisitHistorySheet } from "@/features/patients/patient-visit-history";
import { EncounterPrescriptionCard } from "@/features/prescriptions/encounter-prescription-card";
import { RequirePermission } from "@/features/access/require-permission";
import { useDetailQuery, useRelatedListQuery } from "@/hooks/use-detail-query";
import { useVitalUnits } from "@/hooks/use-vital-units";
import { DEFAULT_VITAL_UNITS } from "@/lib/vitals/units";
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
  const latestVitals = sortedVitals[0];
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
        <div className="flex flex-wrap items-center gap-2">
          <PatientVisitHistorySheet patientId={encounter.patient} />
          <CompleteEncounterButton encounter={encounter} onUpdated={refetchAll} />
          <PrintRecordButton href={`/consultation/${encounterId}/print?auto=1`} label="Print medical record" />
        </div>
      }
    >
      {patientProfile ? (
        <ConsultationPatientBanner patient={patientProfile.patient} profile={patientProfile} encounter={encounter} />
      ) : null}

      <Card className="shadow-premium-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Vitals this visit</CardTitle>
          {latestVitals ? (
            <p className="text-xs text-muted-foreground">Latest · {formatWhen(latestVitals.recorded_at)}</p>
          ) : (
            <p className="text-xs text-muted-foreground">Recorded during triage before consultation.</p>
          )}
        </CardHeader>
        <CardContent>
          {latestVitals ? (
            <VitalsGridReadonly row={latestVitals} fields={vitalUnits} />
          ) : (
            <p className="text-sm text-muted-foreground">No vitals recorded yet.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)]">
        <Card className="min-w-0 shadow-premium-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Visit chart</CardTitle>
            <p className="text-xs text-muted-foreground">One section at a time — use tabs instead of scrolling the full chart.</p>
          </CardHeader>
          <CardContent>
            <PanelTabs defaultValue="summary" className="min-w-0">
              <PanelTabsList>
                <PanelTabsTrigger value="summary">Summary</PanelTabsTrigger>
                <PanelTabsTrigger value="vitals">Vitals</PanelTabsTrigger>
                <PanelTabsTrigger value="assessment">Assessment</PanelTabsTrigger>
                <PanelTabsTrigger value="notes">Notes & plan</PanelTabsTrigger>
                <PanelTabsTrigger value="orders">Orders</PanelTabsTrigger>
                <PanelTabsTrigger value="history">History</PanelTabsTrigger>
              </PanelTabsList>

              <PanelTabsContent value="summary" className="mt-4 space-y-6">
                <DetailSection title="Visit summary">
                  <DetailGrid>
                    <DetailField label="Status" value={<StatusText value={encounter.status} />} />
                    <DetailField label="Phase" value={<StatusText value={encounter.phase} />} />
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
              </PanelTabsContent>

              <PanelTabsContent value="vitals" className="mt-4">
                <DetailSection title="Vital signs history">
                  {sortedVitals.length > 0 ? (
                    <div className="space-y-4">
                      {sortedVitals.map((row) => (
                        <div key={row.id} className="space-y-2 rounded-lg border p-3">
                          <p className="text-xs text-muted-foreground">{formatWhen(String(row.recorded_at))}</p>
                          <VitalsGridReadonly row={row} fields={vitalUnits} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No vitals recorded.</p>
                  )}
                </DetailSection>
              </PanelTabsContent>

              <PanelTabsContent value="assessment" className="mt-4 space-y-6">
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
              </PanelTabsContent>

              <PanelTabsContent value="notes" className="mt-4 space-y-6">
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
              </PanelTabsContent>

              <PanelTabsContent value="orders" className="mt-4 space-y-6">
                <DetailSection title="Prescriptions">
                  {prescriptionsQuery.data && prescriptionsQuery.data.length > 0 ? (
                    <div className="space-y-4">
                      {prescriptionsQuery.data.map((prescription) => (
                        <EncounterPrescriptionCard key={prescription.id} prescription={prescription} />
                      ))}
                    </div>
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
              </PanelTabsContent>

              <PanelTabsContent value="history" className="mt-4 space-y-6">
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
              </PanelTabsContent>
            </PanelTabs>
          </CardContent>
        </Card>

        <aside className="min-w-0 xl:sticky xl:top-0 xl:self-start">
          <EncounterWritePanel encounter={encounter} onUpdated={refetchAll} />
        </aside>
      </div>
    </DetailLayout>
  );
}
