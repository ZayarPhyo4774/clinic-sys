import type { Medicine, PrescriptionItem } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const pluralUnits: Record<string, string> = {
  tablet: "tablets",
  capsule: "capsules",
  ml: "ml",
  vial: "vials",
  tube: "tubes",
  piece: "pieces",
};

export function formatMedicineUnit(unit: string, quantity?: number | string) {
  const normalized = unit.trim().toLowerCase();
  if (!normalized) {
    return "";
  }
  const qty = quantity === undefined || quantity === "" ? 2 : Number(quantity);
  if (!Number.isFinite(qty) || qty === 1) {
    return normalized;
  }
  return pluralUnits[normalized] ?? `${normalized}s`;
}

export function formatQuantityWithUnit(quantity: number | string, unit?: string) {
  const value = String(quantity);
  if (!unit) {
    return value;
  }
  const label = formatMedicineUnit(unit, quantity);
  return label ? `${value} ${label}` : value;
}

export function resolvePrescriptionItemUnit(
  item: Pick<PrescriptionItem, "source" | "medicine" | "medicine_unit">,
  unitFor?: (medicineId: string) => string | undefined,
) {
  if (item.source === "external") {
    return "";
  }
  return item.medicine_unit || (item.medicine ? unitFor?.(item.medicine) : "") || "";
}

export function prescriptionItemMedicineLabel(
  item: Pick<PrescriptionItem, "source" | "medicine" | "medicine_name">,
  labelFor?: (medicineId: string) => string,
) {
  if (item.source === "external") {
    return item.medicine_name?.trim() || "External medicine";
  }
  return item.medicine ? labelFor?.(item.medicine) || item.medicine : "—";
}

export function formatMedicineLabel(medicine: Pick<Medicine, "name" | "strength" | "unit">) {
  const detail = [medicine.strength, medicine.unit].filter(Boolean).join(" ");
  return detail ? `${medicine.name} (${detail})` : medicine.name;
}

export function formatPrescriptionItemSummary(
  item: Pick<PrescriptionItem, "dosage" | "frequency" | "duration_days" | "quantity">,
  medicineLabel: string,
  unit?: string,
) {
  const qtyLabel = formatQuantityWithUnit(item.quantity, unit);
  const parts = [medicineLabel, item.dosage, `qty ${qtyLabel}`];
  if (item.frequency) {
    parts.push(item.frequency);
  }
  if (item.duration_days && item.duration_days > 0) {
    parts.push(`${item.duration_days} days`);
  }
  return parts.join(" · ");
}

export function remainingFor(item: Pick<PrescriptionItem, "quantity" | "quantity_dispensed">) {
  return Math.max(0, Number(item.quantity) - Number(item.quantity_dispensed));
}

export function remainingTone(remaining: number) {
  if (remaining === 0) {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  if (remaining <= 2) {
    return "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300";
  }
  return "border-border bg-muted/30 text-muted-foreground";
}

export function remainingBadgeClass(remaining: number) {
  return cn("rounded-full border px-2 py-0.5 text-xs", remainingTone(remaining));
}
