"use client";

import { ApiError, fieldMessages, humanizeApiError, humanizeFieldMessage } from "@/lib/api/errors";

export function FormFieldError({ error, name }: { error: unknown; name: string }) {
  const messages = fieldMessages(error, name).map((message) => humanizeFieldMessage(name, message));
  if (messages.length === 0) {
    return null;
  }
  return (
    <p role="alert" className="text-sm text-destructive">
      {messages.join(" ")}
    </p>
  );
}

export function FormError({ error }: { error: unknown }) {
  if (error instanceof ApiError) {
    const message = humanizeApiError(error);
    if (!message) {
      return null;
    }
    return (
      <p role="alert" className="text-sm text-destructive">
        {message}
      </p>
    );
  }
  if (!(error instanceof Error)) {
    return null;
  }
  return (
    <p role="alert" className="text-sm text-destructive">
      {error.message}
    </p>
  );
}
