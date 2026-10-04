import { ApiError } from "@/lib/api/errors";

export type SyncDisposition = "synced" | "retry" | "conflict" | "reject" | "auth";

export function classifySyncError(error: unknown): SyncDisposition {
  if (!(error instanceof ApiError)) {
    return "retry";
  }
  if (error.status === 0 || error.status >= 500) {
    return "retry";
  }
  if (error.status === 409 || error.code === "conflict") {
    return "conflict";
  }
  if (error.status === 401) {
    return "auth";
  }
  return "reject";
}
