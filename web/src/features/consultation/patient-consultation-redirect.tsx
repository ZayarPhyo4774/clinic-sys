"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { DetailPageState } from "@/components/detail-page-state";
import { RequirePermission } from "@/features/access/require-permission";
import { useDetailQuery } from "@/hooks/use-detail-query";
import { withQuery } from "@/lib/api/client";
import type { Encounter, Page } from "@/lib/api/types";

function pickEncounter(encounters: Encounter[]) {
  return encounters.find((row) => row.status === "open") ?? encounters[0] ?? null;
}

export function PatientConsultationRedirect({ patientId }: { patientId: string }) {
  return (
    <RequirePermission permission="encounters.view" title="Consultation">
      <PatientConsultationRedirectInner patientId={patientId} />
    </RequirePermission>
  );
}

function PatientConsultationRedirectInner({ patientId }: { patientId: string }) {
  const router = useRouter();
  const query = useDetailQuery<Page<Encounter>>(
    "encounters",
    withQuery("/encounters/", { patient: patientId }),
  );

  useEffect(() => {
    if (!query.data) {
      return;
    }
    const target = pickEncounter(query.data.results);
    if (target) {
      router.replace(`/consultation/${target.id}`);
      return;
    }
    router.replace(`/consultation?patient=${patientId}`);
  }, [patientId, query.data, router]);

  return (
    <DetailPageState
      title="Consultation"
      isLoading={query.isLoading}
      error={query.error}
      onRetry={() => void query.refetch()}
    />
  );
}
