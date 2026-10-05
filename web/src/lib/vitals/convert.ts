import type { VitalUnitField, VitalUnitFieldName } from "@/lib/api/types";

const STORAGE_UNITS: Partial<Record<VitalUnitFieldName, string>> = {
  temperature: "°C",
  weight_kg: "kg",
  height_cm: "cm",
};

function toNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatStorageValue(value: number, decimals: number) {
  return value.toFixed(decimals);
}

export function convertTemperatureToStorage(value: string, fromUnit: string) {
  const parsed = toNumber(value);
  if (parsed === null) {
    return value;
  }
  if (fromUnit === "°F") {
    return formatStorageValue(((parsed - 32) * 5) / 9, 1);
  }
  return formatStorageValue(parsed, 1);
}

export function convertTemperatureFromStorage(value: string | number | null | undefined, toUnit: string) {
  const parsed = toNumber(value);
  if (parsed === null) {
    return value;
  }
  if (toUnit === "°F") {
    return ((parsed * 9) / 5 + 32).toFixed(1);
  }
  return value;
}

export function convertWeightToStorage(value: string, fromUnit: string) {
  const parsed = toNumber(value);
  if (parsed === null) {
    return value;
  }
  if (fromUnit === "lb") {
    return formatStorageValue(parsed * 0.453592, 2);
  }
  return formatStorageValue(parsed, 2);
}

export function convertWeightFromStorage(value: string | number | null | undefined, toUnit: string) {
  const parsed = toNumber(value);
  if (parsed === null) {
    return value;
  }
  if (toUnit === "lb") {
    return (parsed / 0.453592).toFixed(1);
  }
  return value;
}

export function convertHeightToStorage(value: string, fromUnit: string) {
  const parsed = toNumber(value);
  if (parsed === null) {
    return value;
  }
  if (fromUnit === "in") {
    return formatStorageValue(parsed * 2.54, 1);
  }
  return formatStorageValue(parsed, 1);
}

export function convertHeightFromStorage(value: string | number | null | undefined, toUnit: string) {
  const parsed = toNumber(value);
  if (parsed === null) {
    return value;
  }
  if (toUnit === "in") {
    return (parsed / 2.54).toFixed(1);
  }
  return value;
}

export function convertVitalFieldToStorage(field: VitalUnitFieldName, value: string, displayUnit: string) {
  if (!value.trim()) {
    return value;
  }
  if (field === "temperature") {
    return convertTemperatureToStorage(value, displayUnit);
  }
  if (field === "weight_kg") {
    return convertWeightToStorage(value, displayUnit);
  }
  if (field === "height_cm") {
    return convertHeightToStorage(value, displayUnit);
  }
  return value;
}

export function convertVitalFieldFromStorage(
  field: VitalUnitFieldName,
  value: string | number | null | undefined,
  displayUnit: string,
) {
  if (value === null || value === undefined || value === "") {
    return value;
  }
  const storageUnit = STORAGE_UNITS[field];
  if (storageUnit && displayUnit === storageUnit) {
    return value;
  }
  if (field === "temperature") {
    return convertTemperatureFromStorage(value, displayUnit);
  }
  if (field === "weight_kg") {
    return convertWeightFromStorage(value, displayUnit);
  }
  if (field === "height_cm") {
    return convertHeightFromStorage(value, displayUnit);
  }
  return value;
}

export function convertVitalsFormToStorage(
  values: Record<VitalUnitFieldName, string>,
  fields: VitalUnitField[],
) {
  const byField = new Map(fields.map((field) => [field.field, field.unit]));
  const converted = { ...values };
  for (const field of fields) {
    converted[field.field] = convertVitalFieldToStorage(field.field, values[field.field], byField.get(field.field) ?? field.unit);
  }
  return converted;
}
