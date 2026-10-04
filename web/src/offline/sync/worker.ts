import { api } from "@/lib/api/client";
import { MAX_ATTEMPTS, type OutboxOperation } from "@/offline/database/schema";
import { isOnline } from "@/offline/connectivity/network";
import { classifySyncError } from "@/offline/conflict/classify";
import { listOutbox, updateOperation } from "@/offline/outbox/outbox-repository";
import { mutationAllowed } from "@/offline/sync/policy";

const listeners = new Set<() => void>();

export function subscribeOutbox(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

function delayMs(retryCount: number) {
  return Math.min(30_000 * 2 ** retryCount, 5 * 60_000);
}

function due(row: OutboxOperation, now: number) {
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

let running = false;

export async function runSync() {
  if (running || !isOnline()) {
    return;
  }
  running = true;
  notify();
  try {
    const rows = await listOutbox();
    const now = Date.now();
    for (const row of rows) {
      if (!due(row, now)) {
        continue;
      }
      if (!mutationAllowed(row.name)) {
        await updateOperation({
          ...row,
          status: "failed",
          retryCount: MAX_ATTEMPTS,
          error: "This operation is not supported offline.",
        });
        continue;
      }
      const started: OutboxOperation = { ...row, status: "in_flight", error: null };
      await updateOperation(started);
      try {
        await api(row.path, {
          method: row.method,
          body: row.body ?? undefined,
          headers: { "Idempotency-Key": row.operationId },
        });
        await updateOperation({ ...started, status: "synced", nextAttemptAt: null, error: null });
      } catch (error) {
        const disposition = classifySyncError(error);
        if (disposition === "auth") {
          await updateOperation({ ...started, status: "pending", error: "Sign in is required before sync." });
          break;
        }
        if (disposition === "conflict") {
          await updateOperation({
            ...started,
            status: "conflict",
            error: error instanceof Error ? error.message : "The server kept a different record.",
          });
          continue;
        }
        if (disposition === "reject") {
          await updateOperation({
            ...started,
            status: "failed",
            retryCount: MAX_ATTEMPTS,
            error: error instanceof Error ? error.message : "The server rejected this operation.",
          });
          continue;
        }
        const retryCount = row.retryCount + 1;
        await updateOperation({
          ...started,
          status: retryCount >= MAX_ATTEMPTS ? "failed" : "pending",
          retryCount,
          nextAttemptAt: new Date(Date.now() + delayMs(retryCount)).toISOString(),
          error: error instanceof Error ? error.message : "The clinic API could not be reached.",
        });
      }
    }
  } finally {
    running = false;
    notify();
  }
}

export function syncInProgress() {
  return running;
}

export async function retryFailed() {
  const rows = await listOutbox();
  for (const row of rows) {
    if (row.status === "failed" || row.status === "conflict") {
      await updateOperation({
        ...row,
        status: "pending",
        retryCount: 0,
        nextAttemptAt: null,
        error: null,
      });
    }
  }
  notify();
  await runSync();
}

export async function outboxCounts() {
  const rows = await listOutbox();
  return {
    pending: rows.filter((row) => row.status === "pending" || row.status === "in_flight").length,
    failed: rows.filter((row) => row.status === "failed" || row.status === "conflict").length,
  };
}
