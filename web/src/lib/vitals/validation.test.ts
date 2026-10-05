import { describe, expect, it } from "vitest";

import { DEFAULT_VITAL_UNITS } from "@/lib/vitals/units";
import { createVitalsDisplaySchema, parseVitalsForm } from "@/lib/vitals/validation";

const fahrenheitUnits = DEFAULT_VITAL_UNITS.map((field) =>
  field.field === "temperature" ? { ...field, unit: "°F" } : field,
);

const poundUnits = DEFAULT_VITAL_UNITS.map((field) =>
  field.field === "weight_kg" ? { ...field, unit: "lb" } : field,
);

describe("createVitalsDisplaySchema", () => {
  it("accepts a normal Fahrenheit temperature", () => {
    const parsed = createVitalsDisplaySchema(fahrenheitUnits).safeParse({
      temperature: "98.6",
      pulse: "",
      respiratory_rate: "",
      systolic: "",
      diastolic: "",
      spo2: "",
      weight_kg: "",
      height_cm: "",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects Fahrenheit values outside the clinical range with unit in the message", () => {
    const parsed = createVitalsDisplaySchema(fahrenheitUnits).safeParse({
      temperature: "200",
      pulse: "",
      respiratory_rate: "",
      systolic: "",
      diastolic: "",
      spo2: "",
      weight_kg: "",
      height_cm: "",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toContain("°F");
      expect(parsed.error.issues[0]?.message).toContain("86");
      expect(parsed.error.issues[0]?.message).toContain("113");
    }
  });

  it("rejects Celsius values above 45 with unit in the message", () => {
    const parsed = createVitalsDisplaySchema(DEFAULT_VITAL_UNITS).safeParse({
      temperature: "46",
      pulse: "",
      respiratory_rate: "",
      systolic: "",
      diastolic: "",
      spo2: "",
      weight_kg: "",
      height_cm: "",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toContain("°C");
    }
  });
});

describe("createVitalsDisplaySchema weight", () => {
  it("accepts a normal pound weight", () => {
    const parsed = createVitalsDisplaySchema(poundUnits).safeParse({
      temperature: "",
      pulse: "",
      respiratory_rate: "",
      systolic: "",
      diastolic: "",
      spo2: "",
      weight_kg: "180",
      height_cm: "",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects pound values outside the clinical range with unit in the message", () => {
    const parsed = createVitalsDisplaySchema(poundUnits).safeParse({
      temperature: "",
      pulse: "",
      respiratory_rate: "",
      systolic: "",
      diastolic: "",
      spo2: "",
      weight_kg: "1500",
      height_cm: "",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toContain("lb");
    }
  });
});

describe("parseVitalsForm", () => {
  it("returns display-unit values for the API after validation", () => {
    const parsed = parseVitalsForm(
      {
        temperature: "98.6",
        pulse: "",
        respiratory_rate: "",
        systolic: "",
        diastolic: "",
        spo2: "",
        weight_kg: "",
        height_cm: "",
      },
      fahrenheitUnits,
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.temperature).toBe("98.6");
    }
  });

  it("returns formatted pound weight for the API", () => {
    const parsed = parseVitalsForm(
      {
        temperature: "",
        pulse: "",
        respiratory_rate: "",
        systolic: "",
        diastolic: "",
        spo2: "",
        weight_kg: "180.5",
        height_cm: "",
      },
      poundUnits,
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.weight_kg).toBe("180.5");
    }
  });
});
