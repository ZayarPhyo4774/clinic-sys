"use client";

import { useQueries } from "@tanstack/react-query";

import { StatusText } from "@/components/record-browser";
import { DetailField, DetailGrid, DetailSection, DetailTable } from "@/components/detail-fields";
import { DetailLayout } from "@/components/detail-layout";
import { DetailPageState } from "@/components/detail-page-state";
import { DoctorLabel, LabTestLabel, PatientLink, RecordLink } from "@/components/record-link";
import { LabOrderWritePanel } from "@/features/laboratory/lab-order-writes";
import { RequirePermission } from "@/features/access/require-permission";
import { useAuth } from "@/features/auth/auth-provider";
import { useDetailQuery, useRelatedListQuery } from "@/hooks/use-detail-query";
import { api } from "@/lib/api/client";
import type { LabOrder, LabOrderItem, LabResult, Page } from "@/lib/api/types";
import { formatWhen } from "@/lib/utils";

export function LabOrderDetailScreen({ orderId }: { orderId: string }) {
  return (
    <RequirePermission permission="laboratory.view" title="Lab order">
      <LabOrderDetail orderId={orderId} />
    </RequirePermission>
  );
}

function LabOrderDetail({ orderId }: { orderId: string }) {
  const { branchId } = useAuth();
  const query = useDetailQuery<LabOrder>("lab-orders", `/lab-orders/${orderId}/`);
  const itemsQuery = useRelatedListQuery<LabOrderItem>("lab-order-items", `/lab-orders/${orderId}/items/`);

  const resultQueries = useQueries({
    queries: (itemsQuery.data ?? []).map((item) => ({
      queryKey: ["lab-results", orderId, item.id, branchId],
      queryFn: async () => {
        const page = await api<Page<LabResult>>(`/lab-orders/${orderId}/items/${item.id}/results/`);
        return { itemId: item.id, labTest: item.lab_test, results: page.results };
      },
      enabled: Boolean(itemsQuery.data),
    })),
  });

  const state = (
    <DetailPageState
      title="Lab order"
      isLoading={query.isLoading}
      error={query.error}
      onRetry={() => void query.refetch()}
    />
  );

  if (query.isLoading || query.error || !query.data) {
    return state;
  }

  const order = query.data;
  const resultsByItem = Object.fromEntries(
    resultQueries
      .map((resultQuery) => [resultQuery.data?.itemId, resultQuery.data?.results ?? []] as const)
      .filter((entry): entry is [string, LabResult[]] => Boolean(entry[0])),
  );
  const resultRows = resultQueries.flatMap((resultQuery) =>
    (resultQuery.data?.results ?? []).map((result) => ({
      ...result,
      lab_test: resultQuery.data?.labTest ?? "—",
    })),
  );

  return (
    <DetailLayout
      breadcrumbs={[
        { label: "Dashboard", href: "/" },
        { label: "Laboratory", href: "/laboratory" },
        { label: formatWhen(order.created_at) },
      ]}
      title="Lab order"
      description={`Status: ${order.status}`}
    >
      <LabOrderWritePanel
        order={order}
        items={itemsQuery.data ?? []}
        resultsByItem={resultsByItem}
        onUpdated={() => {
          void query.refetch();
          void itemsQuery.refetch();
          resultQueries.forEach((resultQuery) => void resultQuery.refetch());
        }}
      />
      <DetailSection title="Order">
        <DetailGrid>
          <DetailField label="Status" value={<StatusText value={order.status} />} />
          <DetailField label="Ordered" value={formatWhen(order.created_at)} />
          <DetailField label="Reported" value={formatWhen(order.reported_at)} />
          <DetailField label="Patient" value={<PatientLink id={order.patient} />} />
          <DetailField
            label="Doctor"
            value={<DoctorLabel id={order.doctor} fullName={order.doctor_full_name} />}
          />
          <DetailField
            label="Encounter"
            value={<RecordLink href={`/consultation/${order.encounter}`}>Open consultation</RecordLink>}
          />
        </DetailGrid>
      </DetailSection>

      <DetailSection title="Tests">
        <DetailTable
          emptyLabel="No tests on this order."
          rows={itemsQuery.data ?? []}
          columns={[{ key: "test", header: "Test", cell: (row) => <LabTestLabel id={String(row.lab_test)} /> }]}
        />
      </DetailSection>

      <DetailSection title="Results">
        <DetailTable
          emptyLabel="No results recorded."
          rows={resultRows}
          columns={[
            { key: "test", header: "Test", cell: (row) => <LabTestLabel id={String(row.lab_test)} /> },
            { key: "value", header: "Value", cell: (row) => `${row.value} ${row.unit}`.trim() },
            { key: "reference", header: "Reference", cell: (row) => String(row.reference_text || "—") },
            { key: "status", header: "Status", cell: (row) => <StatusText value={String(row.status)} /> },
            { key: "when", header: "Recorded", cell: (row) => formatWhen(String(row.recorded_at)) },
          ]}
        />
      </DetailSection>
    </DetailLayout>
  );
}
