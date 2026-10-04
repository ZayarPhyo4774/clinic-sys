export const sexOptions = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "other", label: "Other" },
  { value: "unknown", label: "Unknown" },
] as const;

export const contactKindOptions = [
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "emergency", label: "Emergency" },
] as const;

export const allergySeverityOptions = [
  { value: "mild", label: "Mild" },
  { value: "moderate", label: "Moderate" },
  { value: "severe", label: "Severe" },
  { value: "unknown", label: "Unknown" },
] as const;

export const documentTypeOptions = [
  { value: "identity", label: "Identity" },
  { value: "consent", label: "Consent" },
  { value: "referral", label: "Referral" },
  { value: "other", label: "Other" },
] as const;
