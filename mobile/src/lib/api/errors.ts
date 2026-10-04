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

export function describeError(error: unknown) {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "The request could not be completed.";
}
