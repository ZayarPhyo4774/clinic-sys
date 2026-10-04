"use client";

import { QueryState, describeError } from "@/components/query-state";
import { ApiError } from "@/lib/api/errors";

export function DetailPageState({
  title,
  isLoading,
  error,
  onRetry,
}: {
  title: string;
  isLoading: boolean;
  error: unknown;
  onRetry?: () => void;
}) {
  if (isLoading) {
    return <QueryState status="loading" />;
  }

  if (error) {
    if (error instanceof ApiError && error.status === 403) {
      return <QueryState status="forbidden" title={title} detail={error.message} />;
    }
    if (error instanceof ApiError && error.status === 404) {
      return <QueryState status="unavailable" title={title} detail="This record could not be found." />;
    }
    return <QueryState status="error" detail={describeError(error)} onRetry={onRetry} />;
  }

  return null;
}
