"use client";

import {
  formatMedicineUnit,
  formatQuantityWithUnit,
  prescriptionItemMedicineLabel,
  resolvePrescriptionItemUnit,
} from "@/features/prescriptions/prescription-utils";
import { useMedicineLabelMap } from "@/features/prescriptions/use-medicine-labels";
import type { PrescriptionItem } from "@/lib/api/types";
import { cn } from "@/lib/utils";

function sourceLabel(source: PrescriptionItem["source"]) {
  return source === "external" ? "External · patient source" : "Clinic stock";
}

export function PrescriptionOrderTable({
  items,
  className,
}: {
  items: PrescriptionItem[];
  className?: string;
}) {
  const { labelFor, unitFor } = useMedicineLabelMap();

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No medicines ordered.</p>;
  }

  return (
    <div className={cn("overflow-x-auto rounded-lg border", className)}>
      <table className="w-full min-w-[36rem] text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <th className="px-3 py-2 font-medium">#</th>
            <th className="px-3 py-2 font-medium">Medicine</th>
            <th className="px-3 py-2 font-medium">Dosage</th>
            <th className="px-3 py-2 font-medium">Frequency</th>
            <th className="px-3 py-2 font-medium">Duration</th>
            <th className="px-3 py-2 font-medium">Quantity</th>
            <th className="px-3 py-2 font-medium">Source</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const unit = resolvePrescriptionItemUnit(item, unitFor);
            const qtyLabel = formatQuantityWithUnit(item.quantity, unit);
            const unitLabel = unit ? formatMedicineUnit(unit, item.quantity) : "—";
            return (
              <tr key={item.id} className="border-b last:border-b-0">
                <td className="px-3 py-3 tabular-nums text-muted-foreground">{index + 1}</td>
                <td className="px-3 py-3 font-medium">{prescriptionItemMedicineLabel(item, labelFor)}</td>
                <td className="px-3 py-3">{item.dosage}</td>
                <td className="px-3 py-3">{item.frequency || "—"}</td>
                <td className="px-3 py-3">{item.duration_days ? `${item.duration_days} days` : "—"}</td>
                <td className="px-3 py-3 tabular-nums">
                  {qtyLabel}
                  {unitLabel && unitLabel !== qtyLabel ? (
                    <span className="block text-xs text-muted-foreground">{unitLabel}</span>
                  ) : null}
                </td>
                <td className="px-3 py-3 text-xs text-muted-foreground">{sourceLabel(item.source)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function PrescriptionOrderLine({
  item,
  index,
  className,
}: {
  item: PrescriptionItem;
  index: number;
  className?: string;
}) {
  const { labelFor, unitFor } = useMedicineLabelMap();
  const unit = resolvePrescriptionItemUnit(item, unitFor);
  const isExternal = item.source === "external";

  return (
    <article className={cn("rounded-lg border bg-card p-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground">Line {index + 1}</p>
          <h4 className="text-base font-semibold">{prescriptionItemMedicineLabel(item, labelFor)}</h4>
        </div>
        <span
          className={cn(
            "rounded-full border px-2.5 py-0.5 text-xs",
            isExternal
              ? "border-border bg-muted/30 text-muted-foreground"
              : "border-primary/20 bg-primary/5 text-primary",
          )}
        >
          {sourceLabel(item.source)}
        </span>
      </div>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">Dosage</dt>
          <dd className="mt-0.5 font-medium">{item.dosage}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Frequency</dt>
          <dd className="mt-0.5 font-medium">{item.frequency || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Duration</dt>
          <dd className="mt-0.5 font-medium">{item.duration_days ? `${item.duration_days} days` : "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Quantity ordered</dt>
          <dd className="mt-0.5 font-medium tabular-nums">{formatQuantityWithUnit(item.quantity, unit)}</dd>
        </div>
      </dl>
    </article>
  );
}
