import { databaseAvailable, STORE, withStore } from "@/offline/database/indexed-db";
import type { OutboxOperation, OutboxStatus } from "@/offline/database/schema";

const ACTIVE: OutboxStatus[] = ["pending", "in_flight"];

export function operationFingerprint(input: { userId: string; method: string; path: string; body: string | null }) {
  return `${input.userId}|${input.method}|${input.path}|${input.body ?? ""}`;
}

export function createOperationId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `op-${Date.now()}`;
}

export async function findActiveByFingerprint(fingerprint: string) {
  if (!databaseAvailable()) {
    return null;
  }
  const matches = await withStore<OutboxOperation[]>(STORE.outbox, "readonly", (store) =>
    store.index("fingerprint").getAll(fingerprint),
  );
  return matches.find((row) => ACTIVE.includes(row.status)) ?? null;
}

export async function insertOperation(operation: OutboxOperation) {
  const existing = await withStore<OutboxOperation | undefined>(STORE.outbox, "readonly", (store) =>
    store.get(operation.operationId),
  );
  if (existing) {
    return existing;
  }
  await withStore(STORE.outbox, "readwrite", (store) => store.add(operation));
  return operation;
}

export async function updateOperation(operation: OutboxOperation) {
  await withStore(STORE.outbox, "readwrite", (store) => store.put(operation));
}

export async function listOutbox() {
  if (!databaseAvailable()) {
    return [];
  }
  return withStore<OutboxOperation[]>(STORE.outbox, "readonly", (store) => store.getAll());
}

export async function clearOutbox() {
  if (!databaseAvailable()) {
    return;
  }
  await withStore(STORE.outbox, "readwrite", (store) => store.clear());
}
