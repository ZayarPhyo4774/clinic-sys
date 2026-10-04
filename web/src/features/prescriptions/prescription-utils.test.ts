import { describe, expect, it } from "vitest";

import {
  formatMedicineLabel,
  formatMedicineUnit,
  formatPrescriptionItemSummary,
  formatQuantityWithUnit,
  remainingFor,
} from "@/features/prescriptions/prescription-utils";

describe("prescription-utils", () => {
  it("formats medicine labels with strength and unit", () => {
    expect(formatMedicineLabel({ name: "Paracetamol", strength: "500 mg", unit: "tablet" })).toBe(
      "Paracetamol (500 mg tablet)",
    );
  });

  it("formats medicine units with pluralization", () => {
    expect(formatMedicineUnit("tablet", 1)).toBe("tablet");
    expect(formatMedicineUnit("tablet", 10)).toBe("tablets");
    expect(formatMedicineUnit("ml", 100)).toBe("ml");
  });

  it("formats quantity with unit of measure", () => {
    expect(formatQuantityWithUnit("10", "tablet")).toBe("10 tablets");
  });

  it("summarizes prescription lines for review", () => {
    expect(
      formatPrescriptionItemSummary(
        { dosage: "1 tab", frequency: "daily", duration_days: 5, quantity: "10" },
        "Paracetamol (500 mg tablet)",
        "tablet",
      ),
    ).toBe("Paracetamol (500 mg tablet) · 1 tab · qty 10 tablets · daily · 5 days");
  });

  it("calculates remaining quantity", () => {
    expect(remainingFor({ quantity: "10", quantity_dispensed: "3" })).toBe(7);
  });
});
