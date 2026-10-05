import { z } from "zod";

import type { VitalsFormValues } from "@/lib/forms/write-schemas";
import { buildVitalsBody, vitalsSchema } from "@/lib/forms/write-schemas";
import type { VitalUnitField, VitalUnitFieldName } from "@/lib/api/types";

import { convertVitalsFormToStorage } from "./convert";

type DisplayRange = { min: number; max: number; decimals?: number };

export const TEMPERATURE_DISPLAY_RANGES: Record<string, DisplayRange> = {
  "°C": { min: 30, max: 45, decimals: 1 },
  "°F": { min: 86, max: 113, decimals: 1 },
};

export const WEIGHT_DISPLAY_RANGES: Record<string, DisplayRange> = {
  kg: { min: 0.2, max: 500, decimals: 2 },
  lb: { min: 0.4, max: 1102, decimals: 1 },
};

export const HEIGHT_DISPLAY_RANGES: Record<string, DisplayRange> = {
  cm: { min: 30, max: 250, decimals: 1 },
  in: { min: 12, max: 98, decimals: 1 },
};

function displayRangeFor(field: VitalUnitFieldName, unit: string): DisplayRange | null {
  if (field === "temperature") {
    return TEMPERATURE_DISPLAY_RANGES[unit] ?? TEMPERATURE_DISPLAY_RANGES["°C"];
  }
  if (field === "weight_kg") {
    return WEIGHT_DISPLAY_RANGES[unit] ?? WEIGHT_DISPLAY_RANGES.kg;
  }
  if (field === "height_cm") {
    return HEIGHT_DISPLAY_RANGES[unit] ?? HEIGHT_DISPLAY_RANGES.cm;
  }
  return null;
}

function optionalVitalInt(min: number, max: number, label: string) {
  return z.string().trim().superRefine((value, context) => {
    if (value === "") {
      return;
    }
    if (!/^\d+$/.test(value)) {
      context.addIssue({ code: "custom", message: `${label} must be a whole number.` });
      return;
    }
    const parsed = Number(value);
    if (parsed < min || parsed > max) {
      context.addIssue({
        code: "custom",
        message: `${label} must be between ${min} and ${max}.`,
      });
    }
  });
}

function optionalVitalDecimal(
  min: number,
  max: number,
  label: string,
  unit?: string,
  decimals?: number,
) {
  return z.string().trim().superRefine((value, context) => {
    if (value === "") {
      return;
    }
    if (!/^\d+(\.\d+)?$/.test(value)) {
      context.addIssue({ code: "custom", message: `${label} must be a valid number.` });
      return;
    }
    if (decimals !== undefined) {
      const fraction = value.split(".")[1];
      if (fraction && fraction.length > decimals) {
        context.addIssue({
          code: "custom",
          message: `${label} allows at most ${decimals} decimal place${decimals === 1 ? "" : "s"}.`,
        });
        return;
      }
    }
    const parsed = Number(value);
    const unitSuffix = unit ? ` ${unit}` : "";
    if (parsed < min || parsed > max) {
      context.addIssue({
        code: "custom",
        message: `${label} must be between ${min} and ${max}${unitSuffix}.`,
      });
    }
  });
}

function unitAwareDecimal(field: VitalUnitFieldName, unit: string, label: string) {
  const range = displayRangeFor(field, unit);
  if (!range) {
    return z.string().trim();
  }
  return optionalVitalDecimal(range.min, range.max, label, unit, range.decimals);
}

export function createVitalsDisplaySchema(fields: VitalUnitField[]) {
  const byField = new Map(fields.map((field) => [field.field, field]));

  return z
    .object({
      temperature: unitAwareDecimal(
        "temperature",
        byField.get("temperature")?.unit ?? "°C",
        "Temperature",
      ),
      pulse: optionalVitalInt(20, 250, "Pulse"),
      respiratory_rate: optionalVitalInt(5, 80, "Respiratory rate"),
      systolic: optionalVitalInt(50, 250, "Systolic"),
      diastolic: optionalVitalInt(30, 150, "Diastolic"),
      spo2: optionalVitalInt(50, 100, "SpO2"),
      weight_kg: unitAwareDecimal("weight_kg", byField.get("weight_kg")?.unit ?? "kg", "Weight"),
      height_cm: unitAwareDecimal("height_cm", byField.get("height_cm")?.unit ?? "cm", "Height"),
    })
    .superRefine((value, context) => {
      const hasValue = Object.values(value).some((item) => item.length > 0);
      if (!hasValue) {
        context.addIssue({
          code: "custom",
          message: "Enter at least one measurement.",
          path: ["temperature"],
        });
        return;
      }

      const hasSystolic = value.systolic.length > 0;
      const hasDiastolic = value.diastolic.length > 0;
      if (hasSystolic !== hasDiastolic) {
        context.addIssue({
          code: "custom",
          message: "Record both blood pressure numbers.",
          path: ["systolic"],
        });
        context.addIssue({
          code: "custom",
          message: "Record both blood pressure numbers.",
          path: ["diastolic"],
        });
        return;
      }

      if (hasSystolic && hasDiastolic) {
        const systolic = Number(value.systolic);
        const diastolic = Number(value.diastolic);
        if (systolic <= diastolic) {
          context.addIssue({
            code: "custom",
            message: "Systolic must be higher than diastolic.",
            path: ["systolic"],
          });
        }
      }
    });
}

const STORAGE_UNIT_FIELDS: VitalUnitFieldName[] = ["temperature", "weight_kg", "height_cm"];

export function formatVitalDisplayValue(field: VitalUnitFieldName, value: string, unit: string) {
  if (!value.trim()) {
    return value;
  }
  const range = displayRangeFor(field, unit);
  if (!range) {
    return value.trim();
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return value.trim();
  }
  return parsed.toFixed(range.decimals ?? 0);
}

function remapStorageValidationError(
  issue: z.ZodIssue,
  fields: VitalUnitField[],
): z.ZodIssue {
  const field = issue.path[0];
  if (typeof field !== "string" || !STORAGE_UNIT_FIELDS.includes(field as VitalUnitFieldName)) {
    return issue;
  }
  const configured = fields.find((row) => row.field === field);
  const unit = configured?.unit ?? "";
  const range = displayRangeFor(field as VitalUnitFieldName, unit);
  if (!range || !issue.message.includes("between")) {
    return issue;
  }
  const label = configured?.label ?? field;
  return {
    ...issue,
    message: `${label} must be between ${range.min} and ${range.max} ${unit}.`,
  };
}

export function vitalFieldInputProps(field: VitalUnitFieldName, unit: string) {
  const range = displayRangeFor(field, unit);
  if (!range) {
    return {};
  }
  return {
    step: range.decimals === 2 ? "0.01" : "0.1",
    min: range.min,
    max: range.max,
    title: `${range.min}–${range.max} ${unit}`,
  };
}

export function parseVitalsForm(
  values: Record<VitalUnitFieldName, string>,
  fields: VitalUnitField[],
):
  | { ok: true; data: VitalsFormValues }
  | { ok: false; error: z.ZodError } {
  const displayParsed = createVitalsDisplaySchema(fields).safeParse(values);
  if (!displayParsed.success) {
    return { ok: false, error: displayParsed.error };
  }

  const storageValues = convertVitalsFormToStorage(displayParsed.data, fields);
  const storageParsed = vitalsSchema.safeParse(storageValues);
  if (!storageParsed.success) {
    return {
      ok: false,
      error: new z.ZodError(
        storageParsed.error.issues.map((issue) => remapStorageValidationError(issue, fields)),
      ),
    };
  }

  // API expects display-unit values; the backend converts once on save.
  return { ok: true, data: displayParsed.data };
}

export function buildVitalsApiBody(
  data: VitalsFormValues,
  fields: VitalUnitField[],
): Record<string, string | number> {
  const unitsByField = new Map(fields.map((field) => [field.field, field.unit]));
  return buildVitalsBody({
    ...data,
    temperature: data.temperature
      ? formatVitalDisplayValue("temperature", data.temperature, unitsByField.get("temperature") ?? "°C")
      : data.temperature,
    weight_kg: data.weight_kg
      ? formatVitalDisplayValue("weight_kg", data.weight_kg, unitsByField.get("weight_kg") ?? "kg")
      : data.weight_kg,
    height_cm: data.height_cm
      ? formatVitalDisplayValue("height_cm", data.height_cm, unitsByField.get("height_cm") ?? "cm")
      : data.height_cm,
  });
}
