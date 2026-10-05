import { z } from "zod";

import { isFutureDate, type PatientBirthMode } from "@/lib/patients/age";

const birthModeSchema = z.enum(["dob", "age"]);

function validateBirthFields(
  value: { birth_mode: PatientBirthMode; date_of_birth: string; age: string },
  context: z.RefinementCtx,
) {
  if (value.birth_mode === "dob") {
    if (!value.date_of_birth.trim()) {
      context.addIssue({
        code: "custom",
        message: "Date of birth is required.",
        path: ["date_of_birth"],
      });
      return;
    }
    if (isFutureDate(value.date_of_birth)) {
      context.addIssue({
        code: "custom",
        message: "Date of birth cannot be in the future.",
        path: ["date_of_birth"],
      });
    }
    return;
  }

  if (!value.age.trim()) {
    context.addIssue({
      code: "custom",
      message: "Age is required.",
      path: ["age"],
    });
    return;
  }
  if (!/^\d+$/.test(value.age.trim())) {
    context.addIssue({
      code: "custom",
      message: "Age must be a whole number of years.",
      path: ["age"],
    });
    return;
  }
  const parsedAge = Number(value.age);
  if (parsedAge < 0 || parsedAge > 150) {
    context.addIssue({
      code: "custom",
      message: "Age must be between 0 and 150 years.",
      path: ["age"],
    });
  }
}

export const patientBirthFieldsSchema = z
  .object({
    birth_mode: birthModeSchema,
    date_of_birth: z.string(),
    age: z.string(),
  })
  .superRefine(validateBirthFields);

export function buildPatientBirthPayload(data: z.infer<typeof patientBirthFieldsSchema>) {
  if (data.birth_mode === "age") {
    return { age: Number(data.age.trim()) };
  }
  return { date_of_birth: data.date_of_birth };
}

export type PatientDemographicsPayload =
  | { full_name: string; sex: string; age: number }
  | { full_name: string; sex: string; date_of_birth: string };

export function buildPatientDemographicsPayload(data: {
  full_name: string;
  sex: string;
  birth_mode: PatientBirthMode;
  date_of_birth: string;
  age: string;
}): PatientDemographicsPayload {
  if (data.birth_mode === "age") {
    return {
      full_name: data.full_name,
      sex: data.sex,
      age: Number(data.age.trim()),
    };
  }
  return {
    full_name: data.full_name,
    sex: data.sex,
    date_of_birth: data.date_of_birth,
  };
}
