import { MAX_ATTEMPTS } from "@/offline/database/schema";

export function delayMs(retryCount: number) {
  return Math.min(30_000 * 2 ** retryCount, 5 * 60_000);
}

export function isDue(
  row: { status: string; retryCount: number; nextAttemptAt: string | null },
  now: number,
) {
  if (row.status === "synced" || row.status === "conflict") {
    return false;
  }
  if (row.status === "failed" && row.retryCount >= MAX_ATTEMPTS) {
    return false;
  }
  if (row.nextAttemptAt && Date.parse(row.nextAttemptAt) > now) {
    return false;
  }
  return row.status === "pending" || row.status === "failed" || row.status === "in_flight";
}