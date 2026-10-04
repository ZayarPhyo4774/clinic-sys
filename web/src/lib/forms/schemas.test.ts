import { describe, expect, it } from "vitest";

import { bookAppointmentSchema, registerPatientSchema, vitalsSchema } from "@/lib/forms/schemas";

describe("registerPatientSchema", () => {
  it("accepts a valid payload", () => {
    const parsed = registerPatientSchema.safeParse({
      full_name: "Jane Doe",
      date_of_birth: "1990-01-02",
      sex: "female",
    });
    expect(parsed.success).toBe(true);
  });

  it("requires full name and sex", () => {
    const parsed = registerPatientSchema.safeParse({
      full_name: " ",
      date_of_birth: "",
      sex: undefined,
    });
    expect(parsed.success).toBe(false);
  });
});

describe("vitalsSchema", () => {
  it("accepts a valid partial vitals payload", () => {
    const parsed = vitalsSchema.safeParse({
      temperature: "37.2",
      pulse: "80",
      respiratory_rate: "",
      systolic: "120",
      diastolic: "80",
      spo2: "",
      weight_kg: "",
      height_cm: "",
    });
    expect(parsed.success).toBe(true);
  });

  it("requires both blood pressure numbers", () => {
    const parsed = vitalsSchema.safeParse({
      temperature: "",
      pulse: "",
      respiratory_rate: "",
      systolic: "120",
      diastolic: "",
      spo2: "",
      weight_kg: "",
      height_cm: "",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects decimal pulse values", () => {
    const parsed = vitalsSchema.safeParse({
      temperature: "",
      pulse: "80.5",
      respiratory_rate: "",
      systolic: "",
      diastolic: "",
      spo2: "",
      weight_kg: "",
      height_cm: "",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("bookAppointmentSchema", () => {
  it("rejects an end time before the start time", () => {
    const parsed = bookAppointmentSchema.safeParse({
      patient: "11111111-1111-4111-8111-111111111111",
      doctor: "22222222-2222-4222-8222-222222222222",
      starts_at: "2026-10-01T10:00",
      ends_at: "2026-10-01T09:00",
      visit_reason: "Follow-up",
    });
    expect(parsed.success).toBe(false);
  });
});
