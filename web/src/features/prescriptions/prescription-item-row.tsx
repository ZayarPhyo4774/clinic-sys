"use client";

import { RecordLink } from "@/components/record-link";
import { DispenseItemForm } from "@/features/prescriptions/prescription-writes";
import {
  formatQuantityWithUnit,
  remainingBadgeClass,
  remainingFor,
  resolvePrescriptionItemUnit,
} from "@/features/prescriptions/prescription-utils";
import { useMedicineLabelMap } from "@/features/prescriptions/use-medicine-labels";
import type { PrescriptionItem } from "@/lib/api/types";

export function PrescriptionItemRow({
  prescriptionId,
  item,
  onUpdated,
}: {
  prescriptionId: string;
  item: PrescriptionItem;
  onUpdated: () => void;
}) {
  const { labelFor, unitFor } = useMedicineLabelMap();
  const remaining = remainingFor(item);
  const medicineLabel = labelFor(item.medicine);
  const unit = resolvePrescriptionItemUnit(item, unitFor);

  return (
    <li className="min-w-0 rounded-md border p-3 text-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className={remainingBadgeClass(remaining)}>
          Remaining: {formatQuantityWithUnit(remaining, unit)}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <p className="font-medium">{medicineLabel}</p>
          <RecordLink href={`/pharmacy/${item.medicine}`}>
            <span className="text-xs">View in pharmacy</span>
          </RecordLink>
        </div>
        <p>
          <span className="text-muted-foreground">Dosage: </span>
          {item.dosage}
        </p>
        <p>
          <span className="text-muted-foreground">Frequency: </span>
          {item.frequency || "—"}
        </p>
        <p>
          <span className="text-muted-foreground">Duration: </span>
          {item.duration_days ? `${item.duration_days} days` : "—"}
        </p>
        <p>
          <span className="text-muted-foreground">Quantity: </span>
          {formatQuantityWithUnit(item.quantity_dispensed, unit)}/{formatQuantityWithUnit(item.quantity, unit)}
        </p>
      </div>
      <DispenseItemForm prescriptionId={prescriptionId} item={item} onUpdated={onUpdated} />
    </li>
  );
}
