import { z } from "zod";

import { sexOptions } from "@/features/patients/contract";
import { validationError } from "@/lib/api/errors";

const sexValues = sexOptions.map((option) => option.value) as [string, ...string[]];

export const registerPatientSchema = z.object({
  full_name: z.string().trim().min(1, "Full name is required."),
  date_of_birth: z.string().min(1, "Date of birth is required."),
  sex: z.enum(sexValues, { message: "Sex is required." }),
});

export const bookAppointmentSchema = z
  .object({
    patient: z.string().uuid("Choose a patient."),
    doctor: z.string().uuid("Choose a doctor."),
    starts_at: z.string().min(1, "Start time is required."),
    ends_at: z.string().min(1, "End time is required."),
    visit_reason: z.string().trim(),
  })
  .superRefine((value, context) => {
    const starts = new Date(value.starts_at);
    const ends = new Date(value.ends_at);
    if (Number.isNaN(starts.getTime())) {
      context.addIssue({ code: "custom", message: "Enter a valid start time.", path: ["starts_at"] });
      return;
    }
    if (Number.isNaN(ends.getTime())) {
      context.addIssue({ code: "custom", message: "Enter a valid end time.", path: ["ends_at"] });
      return;
    }
    if (ends <= starts) {
      context.addIssue({ code: "custom", message: "End time must be after start time.", path: ["ends_at"] });
    }
  });

export function formatZodError(error: z.ZodError) {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "non_field_errors");
    fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
  }
  return fieldErrors;
}

export function parseForm<T>(schema: z.ZodType<T>, data: unknown) {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error };
  }
  return { ok: true as const, data: parsed.data };
}

export function validateForm<T>(
  schema: z.ZodType<T>,
  data: unknown,
  setError: (error: unknown) => void,
): T | null {
  const parsed = parseForm(schema, data);
  if (!parsed.ok) {
    setError(validationError(formatZodError(parsed.error)));
    return null;
  }
  return parsed.data;
}

export * from "@/lib/forms/write-schemas";
