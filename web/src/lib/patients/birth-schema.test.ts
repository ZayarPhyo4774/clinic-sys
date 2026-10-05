import { describe, expect, it } from "vitest";

import {
  buildPatientBirthPayload,
  buildPatientDemographicsPayload,
  patientBirthFieldsSchema,
} from "@/lib/patients/birth-schema";

describe("patientBirthFieldsSchema", () => {
  it("builds an age payload", () => {
    const parsed = patientBirthFieldsSchema.safeParse({
      birth_mode: "age",
      date_of_birth: "",
      age: "32",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(buildPatientBirthPayload(parsed.data)).toEqual({ age: 32 });
    }
  });

  it("builds a date-of-birth payload", () => {
    const parsed = patientBirthFieldsSchema.safeParse({
      birth_mode: "dob",
      date_of_birth: "1990-01-02",
      age: "",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(buildPatientBirthPayload(parsed.data)).toEqual({ date_of_birth: "1990-01-02" });
    }
  });

  it("builds a full demographics payload without undefined birth fields", () => {
    expect(
      buildPatientDemographicsPayload({
        full_name: "Jane Doe",
        sex: "female",
        birth_mode: "age",
        date_of_birth: "",
        age: "32",
      }),
    ).toEqual({ full_name: "Jane Doe", sex: "female", age: 32 });
  });
});
