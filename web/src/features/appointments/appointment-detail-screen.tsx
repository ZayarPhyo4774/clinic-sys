"use client";

import { StatusText } from "@/components/record-browser";
import { DetailField, DetailGrid, DetailSection } from "@/components/detail-fields";
import { DetailLayout } from "@/components/detail-layout";
import { DetailPageState } from "@/components/detail-page-state";
import { DoctorLabel, PatientLink, RecordLink } from "@/components/record-link";
import { AppointmentActions } from "@/features/appointments/appointment-actions";
import { RequirePermission } from "@/features/access/require-permission";
import { useDetailQuery, useRelatedListQuery } from "@/hooks/use-detail-query";
import { withQuery } from "@/lib/api/client";
import type { Appointment, Encounter, QueueEntry } from "@/lib/api/types";
import { formatWhen } from "@/lib/utils";

export function AppointmentDetailScreen({ appointmentId }: { appointmentId: string }) {
  return (
    <RequirePermission permission="appointments.view" title="Appointment">
      <AppointmentDetail appointmentId={appointmentId} />
    </RequirePermission>
  );
}

function AppointmentDetail({ appointmentId }: { appointmentId: string }) {
  const query = useDetailQuery<Appointment>("appointments", `/appointments/${appointmentId}/`);
  const appointment = query.data;

  const serviceDate = appointment?.starts_at.slice(0, 10);
  const queueQuery = useRelatedListQuery<QueueEntry>(
    "queue",
    appointment && serviceDate
      ? withQuery("/queue-entries/", { date: serviceDate, doctor: appointment.doctor })
      : null,
  );
  const encountersQuery = useRelatedListQuery<Encounter>(
    "encounters",
    appointment ? withQuery("/encounters/", { patient: appointment.patient }) : null,
  );

  const state = (
    <DetailPageState
      title="Appointment"
      isLoading={query.isLoading}
      error={query.error}
      onRetry={() => void query.refetch()}
    />
  );

  if (query.isLoading || query.error || !appointment) {
    return state;
  }

  const queueEntry = queueQuery.data?.find((entry) => entry.appointment === appointment.id);
  const encounter = encountersQuery.data?.find((item) => item.appointment === appointment.id);

  return (
    <DetailLayout
      breadcrumbs={[
        { label: "Dashboard", href: "/" },
        { label: "Appointments", href: "/appointments" },
        { label: formatWhen(appointment.starts_at) },
      ]}
      title="Appointment"
      description={appointment.visit_reason || "No visit reason recorded."}
    >
      <AppointmentActions
        appointment={appointment}
        encounter={encounter}
        onUpdated={() => {
          void query.refetch();
          void queueQuery.refetch();
          void encountersQuery.refetch();
        }}
      />
      <DetailSection title="Visit">
        <DetailGrid>
          <DetailField label="Status" value={<StatusText value={appointment.status} />} />
          <DetailField label="Starts" value={formatWhen(appointment.starts_at)} />
          <DetailField label="Ends" value={formatWhen(appointment.ends_at)} />
          <DetailField label="Patient" value={<PatientLink id={appointment.patient} />} />
          <DetailField
            label="Doctor"
            value={<DoctorLabel id={appointment.doctor} fullName={appointment.doctor_full_name} />}
          />
          <DetailField label="Reason" value={appointment.visit_reason || "—"} />
        </DetailGrid>
      </DetailSection>

      <DetailSection title="Related records">
        <DetailGrid>
          <DetailField
            label="Queue entry"
            value={
              queueEntry ? (
                <RecordLink href="/queue">
                  Position {queueEntry.position} · {queueEntry.status}
                </RecordLink>
              ) : (
                "Not in queue"
              )
            }
          />
          <DetailField
            label="Consultation"
            value={
              encounter ? (
                <RecordLink href={`/consultation/${encounter.id}`}>
                  {encounter.status} · {formatWhen(encounter.started_at)}
                </RecordLink>
              ) : (
                "No encounter started"
              )
            }
          />
        </DetailGrid>
      </DetailSection>
    </DetailLayout>
  );
}
