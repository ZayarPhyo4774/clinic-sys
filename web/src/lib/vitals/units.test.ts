import { describe, expect, it } from "vitest";

import {
  DEFAULT_VITAL_UNITS,
  formatBloodPressure,
  formatVitalValue,
  vitalFieldLabel,
  vitalPrintHeaders,
  vitalPrintRow,
} from "@/lib/vitals/units";

describe("vital units", () => {
  it("builds labels with units from metadata", () => {
    const temperature = DEFAULT_VITAL_UNITS.find((field) => field.field === "temperature");
    expect(temperature).toBeDefined();
    expect(vitalFieldLabel(temperature!)).toBe("Temperature (°C)");
    expect(formatVitalValue(temperature!, "37.2")).toBe("37.2 °C");
  });

  it("formats blood pressure with dynamic unit", () => {
    expect(formatBloodPressure(120, 80, "mmHg")).toBe("120/80 mmHg");
  });

  it("aligns print headers and rows", () => {
    const row = {
      temperature: "37.0",
      pulse: 72,
      respiratory_rate: 18,
      systolic: 120,
      diastolic: 80,
      spo2: 98,
      weight_kg: "70",
      height_cm: "170",
    };
    const headers = vitalPrintHeaders(DEFAULT_VITAL_UNITS);
    const values = vitalPrintRow(row, DEFAULT_VITAL_UNITS);
    expect(headers.length).toBe(values.length);
    expect(headers[0]).toBe("Temp (°C)");
    expect(values[3]).toBe("120/80 mmHg");
  });
});
