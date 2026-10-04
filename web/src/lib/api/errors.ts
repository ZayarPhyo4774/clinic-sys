export class ApiError extends Error {
  status: number;
  code: string;
  fields: Record<string, string[]>;

  constructor(status: number, detail: string, code: string, fields: Record<string, string[]>) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export function fieldMessages(error: unknown, field: string): string[] {
  if (error instanceof ApiError) {
    return error.fields[field] ?? [];
  }
  return [];
}

export function isBranchAuthorizationError(error: ApiError) {
  if (error.message === "Branch is not authorized.") {
    return true;
  }
  if ((error.fields.branch?.length ?? 0) > 0) {
    return true;
  }
  if ((error.fields["X-Branch-Id"]?.length ?? 0) > 0) {
    return true;
  }
  return false;
}

export function validationError(fields: Record<string, string[]>, detail = "Check the highlighted fields.") {
  return new ApiError(400, detail, "validation_error", fields);
}

const FIELD_LABELS: Record<string, string> = {
  patient: "Patient",
  doctor: "Doctor",
  branch: "Branch",
  encounter: "Encounter",
  unit_price: "Unit price",
  quantity: "Quantity",
  kind: "Charge type",
  description: "Description",
  method: "Payment method",
  amount: "Amount",
};

export function humanizeFieldMessage(field: string, message: string): string {
  if (message === "This field is required.") {
    switch (field) {
      case "patient":
        return "Choose a patient.";
      case "doctor":
        return "Choose a doctor.";
      case "branch":
        return "Select a branch in the sidebar.";
      case "encounter":
        return "An open consultation is required. Create the invoice from the consultation screen, or use Billing → Manual invoice.";
      case "unit_price":
        return "Enter a unit price.";
      case "description":
        return "Enter a description.";
      case "method":
        return "Choose a payment method.";
      case "amount":
        return "Enter a payment amount.";
      default:
        return `${FIELD_LABELS[field] ?? field} is required.`;
    }
  }
  return message;
}

export function humanizeApiError(error: ApiError): string {
  const fieldErrors = Object.entries(error.fields).flatMap(([key, messages]) =>
    messages.map((message) =>
      key === "non_field_errors" ? message : humanizeFieldMessage(key, message),
    ),
  );
  if (fieldErrors.length > 0) {
    return fieldErrors.join(" ");
  }
  return error.message;
}

export function formatMutationError(error: unknown, fallback = "The request could not be completed."): string {
  if (error instanceof ApiError) {
    return humanizeApiError(error);
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
