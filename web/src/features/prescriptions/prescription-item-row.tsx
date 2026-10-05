"use client";

import { RecordLink } from "@/components/record-link";
import { PrescriptionOrderLine } from "@/features/prescriptions/prescription-order-line";
import { DispenseItemForm } from "@/features/prescriptions/prescription-writes";
import {
  formatQuantityWithUnit,
  prescriptionItemMedicineLabel,
  remainingBadgeClass,
  remainingFor,
  resolvePrescriptionItemUnit,
} from "@/features/prescriptions/prescription-utils";
import { useMedicineLabelMap } from "@/features/prescriptions/use-medicine-labels";
import type { PrescriptionItem } from "@/lib/api/types";

export function PrescriptionItemRow({
  prescriptionId,
  item,
  index,
  onUpdated,
  variant = "full",
}: {
  prescriptionId: string;
  item: PrescriptionItem;
  index: number;
  onUpdated: () => void;
  variant?: "full" | "dispense";
}) {
  const { labelFor, unitFor } = useMedicineLabelMap();
  const isExternal = item.source === "external";
  const remaining = remainingFor(item);
  const unit = resolvePrescriptionItemUnit(item, unitFor);

  if (isExternal) {
    return null;
  }

  return (
    <li className="min-w-0 space-y-3 rounded-lg border bg-muted/20 p-3">
      {variant === "full" ? <PrescriptionOrderLine item={item} index={index} className="border-0 bg-transparent p-0" /> : null}
      {variant === "dispense" ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p className="font-medium">{prescriptionItemMedicineLabel(item, labelFor)}</p>
          <span className={remainingBadgeClass(remaining)}>
            Dispensed {formatQuantityWithUnit(item.quantity_dispensed, unit)} /{" "}
            {formatQuantityWithUnit(item.quantity, unit)}
          </span>
        </div>
      ) : null}
      {item.medicine ? (
        <RecordLink href={`/pharmacy/${item.medicine}`}>
          <span className="text-xs">View in pharmacy</span>
        </RecordLink>
      ) : null}
      <DispenseItemForm prescriptionId={prescriptionId} item={item} onUpdated={onUpdated} />
    </li>
  );
}
