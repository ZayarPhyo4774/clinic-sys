"use client";

import { StatusText } from "@/components/record-browser";
import { PrintRecordButton } from "@/components/print/print-record-button";
import { RecordLink } from "@/components/record-link";
import { PrescriptionOrderTable } from "@/features/prescriptions/prescription-order-line";
import { useRelatedListQuery } from "@/hooks/use-detail-query";
import type { Prescription, PrescriptionItem } from "@/lib/api/types";
import { formatWhen } from "@/lib/utils";

export function EncounterPrescriptionCard({ prescription }: { prescription: Prescription }) {
  const itemsQuery = useRelatedListQuery<PrescriptionItem>(
    "prescription-items",
    `/prescriptions/${prescription.id}/items/`,
  );
  const items = itemsQuery.data ?? [];

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Prescription · {formatWhen(prescription.created_at)}</p>
          <p className="text-xs text-muted-foreground">
            <StatusText value={prescription.status} />
            {itemsQuery.isLoading ? " · Loading order…" : ` · ${items.length} line${items.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PrintRecordButton href={`/prescriptions/${prescription.id}/print?auto=1`} label="Print" />
          <RecordLink href={`/prescriptions/${prescription.id}`}>Full detail</RecordLink>
        </div>
      </div>
      {itemsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading doctor&apos;s order…</p>
      ) : (
        <PrescriptionOrderTable items={items} />
      )}
    </div>
  );
}
