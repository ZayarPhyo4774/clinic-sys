"use client";

import { FormFieldError } from "@/components/form-field-error";
import { Input } from "@/components/ui/input";
import type { VitalUnitField, VitalUnitFieldName } from "@/lib/api/types";
import { convertVitalsFormToStorage } from "@/lib/vitals/convert";
import {
  VITAL_GRID_COLUMNS,
  vitalGridCellValue,
  vitalGridColumnKey,
  vitalGridColumnLabel,
  vitalGridColumnShortLabel,
} from "@/lib/vitals/grid";
import { computeBmi, vitalUnitsMap, type VitalRowValues } from "@/lib/vitals/units";
import { vitalFieldInputProps } from "@/lib/vitals/validation";
import { cn } from "@/lib/utils";

const GRID_INNER_CLASS = "grid min-w-[44rem] grid-cols-8 gap-2";

function VitalsGridShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("overflow-x-auto rounded-lg border bg-muted/20 p-3", className)}>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function VitalsGridHeader({ fields }: { fields: VitalUnitField[] }) {
  return (
    <div className={GRID_INNER_CLASS} aria-hidden="true">
      {VITAL_GRID_COLUMNS.map((column) => (
        <p
          key={vitalGridColumnKey(column)}
          className="truncate px-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
        >
          {vitalGridColumnLabel(column, fields)}
        </p>
      ))}
    </div>
  );
}

export function VitalsGridReadonly({
  row,
  fields,
  bmi = null,
  className,
}: {
  row: VitalRowValues;
  fields: VitalUnitField[];
  bmi?: string | null;
  className?: string;
}) {
  return (
    <VitalsGridShell className={className}>
      <VitalsGridHeader fields={fields} />
      <div className={GRID_INNER_CLASS}>
        {VITAL_GRID_COLUMNS.map((column) => (
          <div
            key={vitalGridColumnKey(column)}
            className="min-w-0 rounded-md border bg-card px-2 py-2 text-center"
          >
            <p className="truncate text-sm font-semibold tabular-nums">
              {vitalGridCellValue(column, row, fields, bmi)}
            </p>
          </div>
        ))}
      </div>
    </VitalsGridShell>
  );
}

function previewBmi(values: Record<VitalUnitFieldName, string>, fields: VitalUnitField[]) {
  const storage = convertVitalsFormToStorage(values, fields);
  if (!storage.weight_kg?.trim() || !storage.height_cm?.trim()) {
    return null;
  }
  return computeBmi(storage.weight_kg, storage.height_cm);
}

const inputClassName =
  "h-9 border-0 bg-transparent px-1 text-center text-sm font-medium tabular-nums shadow-none focus-visible:ring-0";

export function VitalsGridForm({
  values,
  onChange,
  fields,
  error,
}: {
  values: Record<VitalUnitFieldName, string>;
  onChange: (field: VitalUnitFieldName, value: string) => void;
  fields: VitalUnitField[];
  error?: unknown;
}) {
  const byField = vitalUnitsMap(fields);
  const bmiPreview = previewBmi(values, fields);

  return (
    <VitalsGridShell>
      <VitalsGridHeader fields={fields} />
      <div className={GRID_INNER_CLASS}>
        {VITAL_GRID_COLUMNS.map((column) => {
          if (column.kind === "blood_pressure") {
            return (
              <div
                key="blood_pressure"
                className="min-w-0 rounded-md border bg-card px-1 py-1 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-ring/30"
              >
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-0.5">
                  <Input
                    id="systolic"
                    inputMode="numeric"
                    placeholder="Sys"
                    aria-label="Systolic blood pressure"
                    className={inputClassName}
                    value={values.systolic}
                    onChange={(event) => onChange("systolic", event.target.value)}
                  />
                  <span className="text-xs text-muted-foreground">/</span>
                  <Input
                    id="diastolic"
                    inputMode="numeric"
                    placeholder="Dia"
                    aria-label="Diastolic blood pressure"
                    className={inputClassName}
                    value={values.diastolic}
                    onChange={(event) => onChange("diastolic", event.target.value)}
                  />
                </div>
                <FormFieldError error={error} name="systolic" />
                <FormFieldError error={error} name="diastolic" />
              </div>
            );
          }

          if (column.kind === "bmi") {
            return (
              <div
                key="bmi"
                className="flex min-w-0 items-center justify-center rounded-md border border-dashed bg-muted/30 px-2 py-2"
              >
                <p className="text-sm font-semibold tabular-nums text-muted-foreground">
                  {bmiPreview ?? "—"}
                </p>
              </div>
            );
          }

          const field = byField.get(column.field);
          if (!field) {
            return null;
          }

          const shortLabel = vitalGridColumnShortLabel(column, fields);
          const unitHint =
            column.field === "temperature" ||
            column.field === "weight_kg" ||
            column.field === "height_cm"
              ? field.unit
              : null;
          const inputProps = vitalFieldInputProps(column.field, field.unit);

          return (
            <div
              key={column.field}
              className="min-w-0 rounded-md border bg-card px-1 py-1 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-ring/30"
            >
              <label htmlFor={column.field} className="sr-only">
                {vitalGridColumnLabel(column, fields)}
              </label>
              <Input
                id={column.field}
                inputMode={field.input_mode}
                placeholder={unitHint ? `${shortLabel} (${unitHint})` : shortLabel}
                aria-label={vitalGridColumnLabel(column, fields)}
                className={inputClassName}
                value={values[column.field]}
                onChange={(event) => onChange(column.field, event.target.value)}
                {...inputProps}
              />
              <FormFieldError error={error} name={column.field} />
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Enter at least one value. Blood pressure needs both numbers. Layout matches the consultation chart.
      </p>
    </VitalsGridShell>
  );
}
