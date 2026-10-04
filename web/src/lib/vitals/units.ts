import type { VitalUnitField, VitalUnitFieldName } from "@/lib/api/types";

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

export function formatVitalValue(field: VitalUnitField, value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  return field.unit ? `${value} ${field.unit}` : String(value);
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
  const byField = vitalUnitsMap(fields);
  const temperature = byField.get("temperature");
  const pulse = byField.get("pulse");
  const respiratoryRate = byField.get("respiratory_rate");
  const spo2 = byField.get("spo2");
  const weight = byField.get("weight_kg");
  const height = byField.get("height_cm");
  const bpUnit = byField.get("systolic")?.unit ?? "mmHg";

  return [
    {
      label: temperature?.short_label ?? "Temp",
      value: temperature ? formatVitalValue(temperature, row.temperature ?? null) : String(row.temperature ?? "—"),
    },
    {
      label: pulse?.short_label ?? "Pulse",
      value: pulse ? formatVitalValue(pulse, row.pulse ?? null) : String(row.pulse ?? "—"),
    },
    {
      label: respiratoryRate?.short_label ?? "RR",
      value: respiratoryRate
        ? formatVitalValue(respiratoryRate, row.respiratory_rate ?? null)
        : String(row.respiratory_rate ?? "—"),
    },
    {
      label: "BP",
      value: formatBloodPressure(row.systolic ?? null, row.diastolic ?? null, bpUnit),
    },
    {
      label: spo2?.short_label ?? "SpO₂",
      value: spo2 ? formatVitalValue(spo2, row.spo2 ?? null) : String(row.spo2 ?? "—"),
    },
    {
      label: weight?.short_label ?? "Weight",
      value: weight ? formatVitalValue(weight, row.weight_kg ?? null) : String(row.weight_kg ?? "—"),
    },
    {
      label: height?.short_label ?? "Height",
      value: height ? formatVitalValue(height, row.height_cm ?? null) : String(row.height_cm ?? "—"),
    },
    { label: "BMI", value: bmi ?? "—" },
  ];
}

const VITAL_TABLE_FIELD_ORDER: VitalUnitFieldName[] = [
  "temperature",
  "pulse",
  "respiratory_rate",
  "spo2",
  "weight_kg",
  "height_cm",
];

function bloodPressureUnit(fields: VitalUnitField[]) {
  return vitalUnitsMap(fields).get("systolic")?.unit ?? "mmHg";
}

function bloodPressureColumn(fields: VitalUnitField[]) {
  const bpUnit = bloodPressureUnit(fields);
  return {
    key: "bp",
    header: bpUnit ? `BP (${bpUnit})` : "BP",
    cell: (row: VitalRowValues) =>
      formatBloodPressure(row.systolic ?? null, row.diastolic ?? null, bpUnit),
  };
}

export function vitalHistoryTableColumns(fields: VitalUnitField[]) {
  const byField = vitalUnitsMap(fields);
  const columns = VITAL_TABLE_FIELD_ORDER.flatMap((fieldName) => {
    const field = byField.get(fieldName);
    if (!field) {
      return [];
    }
    const column = {
      key: field.field,
      header: vitalColumnHeader(field),
      cell: (row: VitalRowValues) => formatVitalValue(field, row[field.field] ?? null),
    };
    if (fieldName === "respiratory_rate") {
      return [column, bloodPressureColumn(fields)];
    }
    return [column];
  });
  return columns;
}

export function vitalPrintHeaders(fields: VitalUnitField[]) {
  const byField = vitalUnitsMap(fields);
  const bpUnit = bloodPressureUnit(fields);
  const headers = VITAL_TABLE_FIELD_ORDER.flatMap((fieldName) => {
    const field = byField.get(fieldName);
    if (!field) {
      return [];
    }
    const header = vitalColumnHeader(field);
    if (fieldName === "respiratory_rate") {
      return [header, bpUnit ? `BP (${bpUnit})` : "BP"];
    }
    return [header];
  });
  return headers;
}

export function vitalPrintRow(row: VitalRowValues, fields: VitalUnitField[]) {
  const byField = vitalUnitsMap(fields);
  const bpUnit = bloodPressureUnit(fields);
  return VITAL_TABLE_FIELD_ORDER.flatMap((fieldName) => {
    const field = byField.get(fieldName);
    if (!field) {
      return [];
    }
    const value = row[field.field] ?? null;
    const formatted = value === null || value === "" ? "—" : String(value);
    if (fieldName === "respiratory_rate") {
      return [
        formatted,
        formatBloodPressure(row.systolic ?? null, row.diastolic ?? null, bpUnit),
      ];
    }
    return [formatted];
  });
}
