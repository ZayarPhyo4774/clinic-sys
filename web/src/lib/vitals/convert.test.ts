import { describe, expect, it } from "vitest";

import { DEFAULT_VITAL_UNITS } from "@/lib/vitals/units";
import { convertVitalsFormToStorage } from "@/lib/vitals/convert";

describe("convertVitalsFormToStorage", () => {
  it("converts Fahrenheit to Celsius before save", () => {
    const fields = DEFAULT_VITAL_UNITS.map((field) =>
      field.field === "temperature" ? { ...field, unit: "°F" } : field,
    );
    const converted = convertVitalsFormToStorage(
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
      fields,
    );
    expect(Number(converted.temperature)).toBeCloseTo(37, 0);
  });
});
