import type { VitalUnitField, VitalUnitFieldName } from "@/lib/api/types";
import { convertVitalFieldFromStorage } from "@/lib/vitals/convert";
import {
  VITAL_GRID_COLUMNS,
  vitalGridCellValue,
  vitalGridColumnKey,
  vitalGridColumnLabel,
  vitalGridPrintValue,
} from "@/lib/vitals/grid";

export const DEFAULT_VITAL_UNITS: VitalUnitField[] = [
  {
    field: "temperature",
    label: "Temperature",
    short_label: "Temp",
    unit: "°C",
    input_mode: "decimal",
  },
  {
    field: "pulse",
    label: "Pulse",
    short_label: "Pulse",
    unit: "bpm",
    input_mode: "numeric",
  },
  {
    field: "respiratory_rate",
    label: "Respiratory rate",
    short_label: "RR",
    unit: "/min",
    input_mode: "numeric",
  },
  {
    field: "spo2",
    label: "SpO₂",
    short_label: "SpO₂",
    unit: "%",
    input_mode: "numeric",
  },
  {
    field: "systolic",
    label: "Systolic",
    short_label: "Systolic",
    unit: "mmHg",
    input_mode: "numeric",
    group: "blood_pressure",
  },
  {
    field: "diastolic",
    label: "Diastolic",
    short_label: "Diastolic",
    unit: "mmHg",
    input_mode: "numeric",
    group: "blood_pressure",
  },
  {
    field: "weight_kg",
    label: "Weight",
    short_label: "Weight",
    unit: "kg",
    input_mode: "decimal",
  },
  {
    field: "height_cm",
    label: "Height",
    short_label: "Height",
    unit: "cm",
    input_mode: "decimal",
  },
];

export const EMPTY_VITAL_FORM_VALUES: Record<VitalUnitFieldName, string> = {
  temperature: "",
  pulse: "",
  respiratory_rate: "",
  systolic: "",
  diastolic: "",
  spo2: "",
  weight_kg: "",
  height_cm: "",
};

export function vitalUnitsMap(fields: VitalUnitField[]) {
  return new Map(fields.map((field) => [field.field, field]));
}

export function vitalFieldLabel(field: VitalUnitField, options?: { includeUnit?: boolean }) {
  if (options?.includeUnit === false || !field.unit) {
    return field.label;
  }
  return `${field.label} (${field.unit})`;
}

export function vitalColumnHeader(field: VitalUnitField) {
  if (field.unit) {
    return `${field.short_label} (${field.unit})`;
  }
  return field.short_label;
}

export type VitalRowValues = Partial<Record<VitalUnitFieldName, string | number | null>>;

export function computeBmi(weightKg: string | null, heightCm: string | null) {
  const weight = weightKg ? Number(weightKg) : NaN;
  const height = heightCm ? Number(heightCm) / 100 : NaN;
  if (!Number.isFinite(weight) || !Number.isFinite(height) || height <= 0) {
    return null;
  }
  return (weight / (height * height)).toFixed(1);
}

export function formatVitalValue(field: VitalUnitField, value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  const displayValue = convertVitalFieldFromStorage(field.field, value, field.unit);
  return field.unit ? `${displayValue} ${field.unit}` : String(displayValue);
}

export function formatBloodPressure(
  systolic: number | null | undefined,
  diastolic: number | null | undefined,
  unit = "mmHg",
) {
  if (systolic == null && diastolic == null) {
    return "—";
  }
  const reading = `${systolic ?? "—"}/${diastolic ?? "—"}`;
  return unit ? `${reading} ${unit}` : reading;
}

export function vitalSnapshotItems(
  row: VitalRowValues,
  fields: VitalUnitField[],
  bmi: string | null,
) {
  return VITAL_GRID_COLUMNS.map((column) => ({
    label: vitalGridColumnLabel(column, fields).replace(/\s*\([^)]+\)/, ""),
    value: vitalGridCellValue(column, row, fields, bmi),
  }));
}

export function vitalHistoryTableColumns(fields: VitalUnitField[]) {
  return VITAL_GRID_COLUMNS.map((column) => ({
    key: vitalGridColumnKey(column),
    header: vitalGridColumnLabel(column, fields),
    cell: (row: VitalRowValues) => vitalGridCellValue(column, row, fields),
  }));
}

export function vitalPrintHeaders(fields: VitalUnitField[]) {
  return VITAL_GRID_COLUMNS.map((column) => vitalGridColumnLabel(column, fields));
}

export function vitalPrintRow(row: VitalRowValues, fields: VitalUnitField[], bmi: string | null = null) {
  return VITAL_GRID_COLUMNS.map((column) => vitalGridPrintValue(column, row, fields, bmi));
}
