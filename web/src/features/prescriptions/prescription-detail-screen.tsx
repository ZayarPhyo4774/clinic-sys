"use client";

import { StatusText } from "@/components/record-browser";
import { PatientAllergyAlert } from "@/components/patient-allergy-alert";
import { DetailField, DetailGrid, DetailSection } from "@/components/detail-fields";
import { DetailLayout } from "@/components/detail-layout";
import { DetailPageState } from "@/components/detail-page-state";
import { PrintRecordButton } from "@/components/print/print-record-button";
import { DoctorLabel, PatientLink, RecordLink } from "@/components/record-link";
import {
  AddPrescriptionItemForm,
  CancelPrescriptionButton,
} from "@/features/prescriptions/prescription-writes";
import { PrescriptionItemRow } from "@/features/prescriptions/prescription-item-row";
import { RequirePermission } from "@/features/access/require-permission";
import { useDetailQuery, useRelatedListQuery } from "@/hooks/use-detail-query";
import type { PatientProfile, Prescription, PrescriptionItem } from "@/lib/api/types";
import { formatWhen } from "@/lib/utils";

const statusOrder = ["active", "partially_dispensed", "dispensed", "cancelled"] as const;

export function PrescriptionDetailScreen({ prescriptionId }: { prescriptionId: string }) {
  return (
    <RequirePermission permission="prescriptions.view" title="Prescription">
      <PrescriptionDetail prescriptionId={prescriptionId} />
    </RequirePermission>
  );
}

function PrescriptionDetail({ prescriptionId }: { prescriptionId: string }) {
  const query = useDetailQuery<Prescription>("prescriptions", `/prescriptions/${prescriptionId}/`);
  const itemsQuery = useRelatedListQuery<PrescriptionItem>(
    "prescription-items",
    `/prescriptions/${prescriptionId}/items/`,
  );
  const patientQuery = useDetailQuery<PatientProfile>(
    "patients",
    query.data ? `/patients/${query.data.patient}/profile/` : null,
  );

  const state = (
    <DetailPageState
      title="Prescription"
      isLoading={query.isLoading}
      error={query.error}
      onRetry={() => void query.refetch()}
    />
  );

  if (query.isLoading || query.error || !query.data) {
    return state;
  }

  const prescription = query.data;
  const items = itemsQuery.data ?? [];

  return (
    <DetailLayout
      breadcrumbs={[
        { label: "Dashboard", href: "/" },
        { label: "Prescriptions", href: "/prescriptions" },
        { label: formatWhen(prescription.created_at) },
      ]}
      title="Prescription"
      description={`Status: ${prescription.status.replace(/_/g, " ")}`}
      actions={
        <>
          <PrintRecordButton href={`/prescriptions/${prescriptionId}/print?auto=1`} label="Print prescription" />
          <CancelPrescriptionButton
            prescriptionId={prescriptionId}
            status={prescription.status}
            compact
            onUpdated={() => void query.refetch()}
          />
        </>
      }
    >
      {patientQuery.data ? <PatientAllergyAlert allergies={patientQuery.data.allergies} /> : null}

      <DetailSection title="Summary">
        <div className="mb-3 flex flex-wrap gap-2">
          {statusOrder.map((status) => {
            const current = prescription.status === status;
            return (
              <span
                key={status}
                className={
                  current
                    ? "rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                    : "rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground"
                }
              >
                {status.replaceAll("_", " ")}
              </span>
            );
          })}
        </div>
        <DetailGrid>
          <DetailField label="Status" value={<StatusText value={prescription.status} />} />
          <DetailField label="Created" value={formatWhen(prescription.created_at)} />
          <DetailField label="Patient" value={<PatientLink id={prescription.patient} />} />
          <DetailField
            label="Doctor"
            value={<DoctorLabel id={prescription.doctor} fullName={prescription.doctor_full_name} />}
          />
          <DetailField
            label="Encounter"
            value={<RecordLink href={`/consultation/${prescription.encounter}`}>Open consultation</RecordLink>}
          />
          <DetailField label="Items" value={String(items.length)} />
        </DetailGrid>
      </DetailSection>

      <DetailSection title="Prescription items">
        <div className="min-w-0 space-y-4">
        <AddPrescriptionItemForm
          prescriptionId={prescriptionId}
          status={prescription.status}
          onUpdated={() => void itemsQuery.refetch()}
        />
        {itemsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading items…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No prescription items.</p>
        ) : (
          <ul className="max-h-[min(70vh,48rem)] space-y-4 overflow-y-auto overscroll-y-contain pr-1">
            {items.map((item) => (
              <PrescriptionItemRow
                key={item.id}
                prescriptionId={prescriptionId}
                item={item}
                onUpdated={() => void itemsQuery.refetch()}
              />
            ))}
          </ul>
        )}
        </div>
      </DetailSection>
    </DetailLayout>
  );
}
