import type { VitalUnitField, VitalUnitFieldName } from "@/lib/api/types";

import { convertVitalFieldFromStorage } from "@/lib/vitals/convert";
import {
  formatBloodPressure,
  formatVitalValue,
  type VitalRowValues,
  vitalColumnHeader,
  vitalUnitsMap,
} from "@/lib/vitals/units";

function bmiFromRow(row: VitalRowValues) {
  const weight = row.weight_kg != null ? Number(row.weight_kg) : NaN;
  const height = row.height_cm != null ? Number(row.height_cm) / 100 : NaN;
  if (!Number.isFinite(weight) || !Number.isFinite(height) || height <= 0) {
    return null;
  }
  return (weight / (height * height)).toFixed(1);
}

export type VitalGridColumn =
  | { kind: "field"; field: VitalUnitFieldName }
  | { kind: "blood_pressure" }
  | { kind: "bmi" };

/** Single column order for triage form, encounter strip, history, and print. */
export const VITAL_GRID_COLUMNS: VitalGridColumn[] = [
  { kind: "field", field: "temperature" },
  { kind: "field", field: "pulse" },
  { kind: "field", field: "respiratory_rate" },
  { kind: "blood_pressure" },
  { kind: "field", field: "spo2" },
  { kind: "field", field: "weight_kg" },
  { kind: "field", field: "height_cm" },
  { kind: "bmi" },
];

export function vitalGridColumnKey(column: VitalGridColumn) {
  if (column.kind === "field") {
    return column.field;
  }
  return column.kind;
}

export function vitalGridColumnLabel(column: VitalGridColumn, fields: VitalUnitField[]) {
  const byField = vitalUnitsMap(fields);
  if (column.kind === "field") {
    const field = byField.get(column.field);
    return field ? vitalColumnHeader(field) : column.field;
  }
  if (column.kind === "blood_pressure") {
    const unit = byField.get("systolic")?.unit ?? "mmHg";
    return unit ? `BP (${unit})` : "BP";
  }
  return "BMI";
}

export function vitalGridColumnShortLabel(column: VitalGridColumn, fields: VitalUnitField[]) {
  const byField = vitalUnitsMap(fields);
  if (column.kind === "field") {
    return byField.get(column.field)?.short_label ?? column.field;
  }
  if (column.kind === "blood_pressure") {
    return "BP";
  }
  return "BMI";
}

export function vitalGridCellValue(
  column: VitalGridColumn,
  row: VitalRowValues,
  fields: VitalUnitField[],
  bmi: string | null = null,
) {
  const byField = vitalUnitsMap(fields);
  if (column.kind === "field") {
    const field = byField.get(column.field);
    if (!field) {
      return "—";
    }
    return formatVitalValue(field, row[column.field] ?? null);
  }
  if (column.kind === "blood_pressure") {
    const unit = byField.get("systolic")?.unit ?? "mmHg";
    return formatBloodPressure(row.systolic ?? null, row.diastolic ?? null, unit);
  }
  return bmi ?? bmiFromRow(row) ?? "—";
}

export function vitalGridPrintValue(
  column: VitalGridColumn,
  row: VitalRowValues,
  fields: VitalUnitField[],
  bmi: string | null = null,
) {
  const byField = vitalUnitsMap(fields);
  if (column.kind === "field") {
    const field = byField.get(column.field);
    const raw = row[column.field];
    if (raw === null || raw === undefined || raw === "") {
      return "—";
    }
    if (!field) {
      return String(raw);
    }
    const display = convertVitalFieldFromStorage(column.field, raw, field.unit);
    return display === null || display === undefined || display === "" ? "—" : String(display);
  }
  if (column.kind === "blood_pressure") {
    const unit = byField.get("systolic")?.unit ?? "mmHg";
    return formatBloodPressure(row.systolic ?? null, row.diastolic ?? null, unit);
  }
  return bmi ?? bmiFromRow(row) ?? "—";
}
