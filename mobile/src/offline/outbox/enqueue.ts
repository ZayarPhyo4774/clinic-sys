import type { OperationType, OutboxOperation } from "@/offline/database/schema";
import { createLocalId } from "@/offline/database/sqlite";
import { findByFingerprint, insertOperation, updateOperation } from "@/offline/outbox/outbox-repository";
import { getDeviceId } from "@/offline/repositories/device-repository";
import { OfflineActionError, type OfflineMutation, mutationAllowed } from "@/offline/sync/policy";

export function operationFingerprint(userId: string, name: string, method: string, path: string, body: string | null) {
  return `${userId}|${name}|${method}|${path}|${body ?? ""}`;
}

export function enqueueMutation(input: {
  userId: string;
  name: OfflineMutation;
  entityType: string;
  entityId: string | null;
  operationType: OperationType;
  method: string;
  path: string;
  body: string | null;
}): { operation: OutboxOperation; created: boolean } {
  if (!mutationAllowed(input.name)) {
    throw new OfflineActionError("This action is not saved on this device.");
  }
  const fingerprint = operationFingerprint(input.userId, input.name, input.method, input.path, input.body);
  const existing = findByFingerprint(input.userId, fingerprint);
  if (existing) {
    if (existing.status === "failed" && !existing.serverEntityId) {
      const reset = { ...existing, status: "pending" as const, retryCount: 0, nextAttemptAt: null, error: null };
      updateOperation(reset);
      return { operation: reset, created: false };
    }
    return { operation: existing, created: false };
  }
  const operation: OutboxOperation = {
    operationId: createLocalId(),
    fingerprint,
    deviceId: getDeviceId(),
    userId: input.userId,
    name: input.name,
    entityType: input.entityType,
    entityId: input.entityId,
    operationType: input.operationType,
    method: input.method,
    path: input.path,
    body: input.body,
    createdAt: new Date().toISOString(),
    status: "pending",
    retryCount: 0,
    nextAttemptAt: null,
    serverEntityId: null,
    error: null,
  };
  insertOperation(operation);
  return { operation, created: true };
}
