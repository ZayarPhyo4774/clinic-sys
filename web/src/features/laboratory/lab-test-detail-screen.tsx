"use client";

import { DetailField, DetailGrid, DetailSection } from "@/components/detail-fields";
import { DetailLayout } from "@/components/detail-layout";
import { DetailPageState } from "@/components/detail-page-state";
import { StatusText } from "@/components/record-browser";
import { RequirePermission } from "@/features/access/require-permission";
import { EditLabTestForm } from "@/features/laboratory/lab-test-writes";
import { ToggleActiveButton } from "@/features/organization/org-writes";
import { allowed } from "@/features/access/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import { useDetailQuery } from "@/hooks/use-detail-query";
import type { LabTest } from "@/lib/api/types";

export function LabTestDetailScreen({ testId }: { testId: string }) {
  return (
    <RequirePermission permission="laboratory.view" title="Lab test">
      <LabTestDetail testId={testId} />
    </RequirePermission>
  );
}

function LabTestDetail({ testId }: { testId: string }) {
  const { account } = useAuth();
  const query = useDetailQuery<LabTest>("lab-tests", `/lab-tests/${testId}/`);
  const canManage = Boolean(account && allowed(account.permissions, "laboratory.manage"));

  const state = (
    <DetailPageState
      title="Lab test"
      isLoading={query.isLoading}
      error={query.error}
      onRetry={() => void query.refetch()}
    />
  );

  if (query.isLoading || query.error || !query.data) {
    return state;
  }

  const test = query.data;

  return (
    <DetailLayout
      breadcrumbs={[
        { label: "Dashboard", href: "/" },
        { label: "Laboratory", href: "/laboratory" },
        { label: test.name },
      ]}
      title={test.name}
      description={test.code}
    >
      {canManage ? (
        <ToggleActiveButton
          path={`/lab-tests/${test.id}/`}
          active={test.is_active}
          resource="lab-tests"
          label="Lab test"
        />
      ) : null}
      <DetailSection title="Catalog">
        <DetailGrid>
          <DetailField label="Code" value={test.code} />
          <DetailField label="Specimen" value={test.specimen} />
          <DetailField label="Unit" value={test.unit} />
          <DetailField label="Reference low" value={test.reference_low ?? "—"} />
          <DetailField label="Reference high" value={test.reference_high ?? "—"} />
          <DetailField label="Reference text" value={test.reference_text || "—"} />
          <DetailField label="Status" value={<StatusText value={test.is_active ? "active" : "inactive"} />} />
        </DetailGrid>
      </DetailSection>
      {canManage ? <EditLabTestForm key={test.id} test={test} onUpdated={() => void query.refetch()} /> : null}
    </DetailLayout>
  );
}
