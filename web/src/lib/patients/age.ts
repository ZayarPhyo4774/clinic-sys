import type { Patient } from "@/lib/api/types";

export type PatientBirthMode = "dob" | "age";

export function patientAge(dateOfBirth: string, reference = new Date()) {
  const born = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(born.getTime())) {
    return null;
  }
  let age = reference.getFullYear() - born.getFullYear();
  const monthDiff = reference.getMonth() - born.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && reference.getDate() < born.getDate())) {
    age -= 1;
  }
  return age;
}

export function formatPatientAgeLabel(
  patient: Pick<Patient, "date_of_birth" | "dob_is_approximate" | "age">,
  reference = new Date(),
) {
  const age = patient.age ?? patientAge(patient.date_of_birth, reference);
  if (age === null) {
    return "Age unknown";
  }
  return patient.dob_is_approximate ? `~${age} years (est.)` : `${age} years`;
}

export function formatPatientDobLabel(patient: Pick<Patient, "date_of_birth" | "dob_is_approximate">) {
  if (patient.dob_is_approximate) {
    return `Approx. ${patient.date_of_birth}`;
  }
  return patient.date_of_birth;
}

export function formatPatientBirthSummary(
  patient: Pick<Patient, "date_of_birth" | "dob_is_approximate" | "age">,
  reference = new Date(),
) {
  const ageLabel = formatPatientAgeLabel(patient, reference);
  if (patient.dob_is_approximate) {
    return ageLabel;
  }
  return `${ageLabel} · DOB ${patient.date_of_birth}`;
}

export function defaultBirthMode(patient: Pick<Patient, "dob_is_approximate">): PatientBirthMode {
  return patient.dob_is_approximate ? "age" : "dob";
}

export function initialAgeValue(patient: Pick<Patient, "date_of_birth" | "dob_is_approximate" | "age">) {
  if (patient.dob_is_approximate) {
    return String(patient.age ?? patientAge(patient.date_of_birth) ?? "");
  }
  return "";
}

export function formatSex(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function isFutureDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return parsed > today;
}
