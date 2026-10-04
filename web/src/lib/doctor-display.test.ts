import { describe, expect, it } from "vitest";

import { formatDoctorOptionLabel, formatDoctorPersonName } from "@/lib/doctor-display";

describe("formatDoctorPersonName", () => {
  it("prefers staff full name over specialty", () => {
    expect(
      formatDoctorPersonName({
        id: "11111111-1111-1111-1111-111111111111",
        staff_full_name: "Dr. Demo",
        specialty: "General practice",
      }),
    ).toBe("Dr. Demo");
  });

  it("never uses specialty as the doctor identity", () => {
    expect(
      formatDoctorPersonName({
        id: "11111111-1111-1111-1111-111111111111",
        specialty: "General practice",
      }),
    ).not.toBe("General practice");
  });
});

describe("formatDoctorOptionLabel", () => {
  it("shows specialty only as secondary detail", () => {
    expect(
      formatDoctorOptionLabel({
        id: "11111111-1111-1111-1111-111111111111",
        staff_full_name: "Dr. Demo",
        specialty: "General practice",
      }),
    ).toBe("Dr. Demo · General practice");
  });
});
