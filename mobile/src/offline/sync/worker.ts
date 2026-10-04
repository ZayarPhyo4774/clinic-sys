import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { MAX_ATTEMPTS, type OutboxOperation, type PrescriptionSubmitBody } from "@/offline/database/schema";
import { ClinicalMismatch, classifySyncError } from "@/offline/conflict/classify";
import { clinicalFieldsDiffer, recordId } from "@/offline/conflict/compare";
import { refreshOnline } from "@/offline/connectivity/network";
import { getOperation, listOutbox, updateOperation } from "@/offline/outbox/outbox-repository";
import { rememberServerProgress, setLocalSync } from "@/offline/repositories/clinical-repository";
import { mutationAllowed } from "@/offline/sync/policy";
import { delayMs, isDue } from "@/offline/sync/schedule";

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

function reload(operationId: string, fallback: OutboxOperation) {
  return getOperation(operationId) ?? fallback;
}

function asRecord(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

async function replayGeneric(row: OutboxOperation) {
  if (row.serverEntityId) {
    return;
  }
  const sent = row.body ? (JSON.parse(row.body) as Record<string, unknown>) : null;
  const received = await api<unknown>(row.path, {
    method: row.method,
    body: row.body ?? undefined,
    headers: { "Idempotency-Key": row.operationId },
  });
  const receivedRecord = asRecord(received);
  const serverEntityId = recordId(received);
  if (serverEntityId) {
    updateOperation({ ...reload(row.operationId, row), serverEntityId });
  }
  if (row.name === "vitals.record" && sent && receivedRecord) {
    const keys = Object.keys(sent);
    if (clinicalFieldsDiffer(sent, receivedRecord, keys)) {
      throw new ClinicalMismatch(
        "The server stored a different vital sign reading. This device kept your copy.",
        received,
      );
    }
  }
  if (row.name === "consultation.note" && sent && receivedRecord) {
    if (clinicalFieldsDiffer(sent, receivedRecord, ["body"])) {
      throw new ClinicalMismatch(
        "The server stored a different consultation note. This device kept your copy.",
        received,
      );
    }
  }
}

async function replayPrescription(row: OutboxOperation) {
  const stored = JSON.parse(row.body || "{}") as PrescriptionSubmitBody;
  let prescriptionId = stored.serverPrescriptionId ?? row.serverEntityId;
  if (!prescriptionId) {
    const created = await api<{ id: string; encounter: string }>("/prescriptions/", {
      method: "POST",
      body: JSON.stringify({ encounter: stored.encounterId }),
      headers: { "Idempotency-Key": row.operationId },
    });
    if (created.encounter !== stored.encounterId) {
      updateOperation({ ...reload(row.operationId, row), serverEntityId: created.id });
      throw new ClinicalMismatch(
        "The server attached this prescription to a different encounter. This device kept your draft.",
        created,
      );
    }
    prescriptionId = created.id;
    const next: PrescriptionSubmitBody = { ...stored, serverPrescriptionId: prescriptionId };
    const current = reload(row.operationId, row);
    updateOperation({ ...current, body: JSON.stringify(next), serverEntityId: prescriptionId });
    rememberServerProgress(row.operationId, next, prescriptionId);
    stored.serverPrescriptionId = prescriptionId;
  }
  if (stored.serverItemId) {
    return;
  }
  const itemBody: Record<string, unknown> = {
    medicine: stored.medicine,
    quantity: stored.quantity,
    dosage: stored.dosage,
    frequency: stored.frequency,
  };
  if (stored.durationDays != null) {
    itemBody.duration_days = stored.durationDays;
  }
  const item = await api<Record<string, unknown>>(`/prescriptions/${prescriptionId}/items/`, {
    method: "POST",
    body: JSON.stringify(itemBody),
    headers: { "Idempotency-Key": stored.itemOperationId },
  });
  const itemId = recordId(item);
  const next: PrescriptionSubmitBody = { ...stored, serverPrescriptionId: prescriptionId, serverItemId: itemId ?? undefined };
  const current = reload(row.operationId, row);
  updateOperation({ ...current, body: JSON.stringify(next), serverEntityId: prescriptionId });
  rememberServerProgress(row.operationId, next, prescriptionId);
  if (clinicalFieldsDiffer(itemBody, item, Object.keys(itemBody))) {
    throw new ClinicalMismatch(
      "The server stored a different prescription item. This device kept your draft.",
      item,
    );
  }
}

let chain: Promise<void> = Promise.resolve();
let running = false;

export function syncInProgress() {
  return running;
}

export function runSync(userId: string | null) {
  if (!userId) {
    return Promise.resolve();
  }
  const task = chain.then(() => performSync(userId));
  chain = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

async function performSync(userId: string) {
  const online = await refreshOnline();
  if (!online) {
    notify();
    return;
  }
  running = true;
  notify();
  try {
    const rows = listOutbox(userId);
    const now = Date.now();
    for (const row of rows) {
      if (!isDue(row, now)) {
        continue;
      }
      if (!mutationAllowed(row.name)) {
        const rejected = {
          ...row,
          status: "failed" as const,
          retryCount: MAX_ATTEMPTS,
          error: "This operation is not supported offline.",
        };
        updateOperation(rejected);
        setLocalSync(row.operationId, "failed", rejected.error);
        continue;
      }
      if (row.serverEntityId && row.name !== "prescriptions.submit") {
        updateOperation({ ...row, status: "synced", error: null, nextAttemptAt: null });
        setLocalSync(row.operationId, "synced", null);
        continue;
      }
      const started = { ...row, status: "in_flight" as const, error: null };
      updateOperation(started);
      setLocalSync(row.operationId, "pending", null);
      try {
        if (row.name === "prescriptions.submit") {
          await replayPrescription(started);
        } else {
          await replayGeneric(started);
        }
        const current = reload(row.operationId, started);
        updateOperation({ ...current, status: "synced", error: null, nextAttemptAt: null });
        setLocalSync(row.operationId, "synced", null);
      } catch (error) {
        const current = reload(row.operationId, started);
        if (error instanceof ClinicalMismatch) {
          updateOperation({
            ...current,
            status: "conflict",
            error: error.message,
            nextAttemptAt: null,
          });
          setLocalSync(row.operationId, "conflict", error.message, error.serverPayload);
          continue;
        }
        const disposition = classifySyncError(error);
        const message =
          error instanceof Error ? error.message : "The clinic API could not be reached.";
        if (disposition === "auth") {
          updateOperation({ ...current, status: "pending", error: "Sign in is required before sync." });
          setLocalSync(row.operationId, "pending", "Sign in is required before sync.");
          break;
        }
        if (disposition === "conflict") {
          const detail = error instanceof ApiError ? error.message : "The server kept a different record.";
          updateOperation({ ...current, status: "conflict", error: detail, nextAttemptAt: null });
          setLocalSync(row.operationId, "conflict", detail);
          continue;
        }
        if (disposition === "reject") {
          updateOperation({
            ...current,
            status: "failed",
            retryCount: MAX_ATTEMPTS,
            error: message,
            nextAttemptAt: null,
          });
          setLocalSync(row.operationId, "failed", message);
          continue;
        }
        const retryCount = row.retryCount + 1;
        const status = retryCount >= MAX_ATTEMPTS ? "failed" : "pending";
        updateOperation({
          ...current,
          status,
          retryCount,
          nextAttemptAt: new Date(Date.now() + delayMs(retryCount)).toISOString(),
          error: message,
        });
        setLocalSync(row.operationId, status === "failed" ? "failed" : "pending", message);
      }
    }
  } finally {
    running = false;
    notify();
  }
}

function hasServerProgress(row: OutboxOperation) {
  if (row.serverEntityId) {
    return true;
  }
  if (!row.body) {
    return false;
  }
  try {
    const body = JSON.parse(row.body) as { serverPrescriptionId?: string; serverItemId?: string };
    return Boolean(body.serverPrescriptionId || body.serverItemId);
  } catch {
    return false;
  }
}

export async function retryFailed(userId: string | null) {
  if (!userId) {
    return;
  }
  const rows = listOutbox(userId);
  for (const row of rows) {
    if (row.status === "conflict" && hasServerProgress(row)) {
      continue;
    }
    if (row.status === "failed" || row.status === "conflict") {
      updateOperation({
        ...row,
        status: "pending",
        retryCount: 0,
        nextAttemptAt: null,
        error: null,
      });
      setLocalSync(row.operationId, "pending", null);
    }
  }
  notify();
  await runSync(userId);
}

export function outboxCounts(userId: string | null) {
  const rows = listOutbox(userId);
  return {
    pending: rows.filter((row) => row.status === "pending" || row.status === "in_flight").length,
    failed: rows.filter((row) => row.status === "failed" || row.status === "conflict").length,
  };
}
