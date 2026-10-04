import { getDeviceId } from "@/offline/repositories/device-repository";
import {
  createOperationId,
  findActiveByFingerprint,
  insertOperation,
  operationFingerprint,
} from "@/offline/outbox/outbox-repository";
import type { OperationType, OutboxOperation } from "@/offline/database/schema";
import { mutationAllowed, OfflineActionError } from "@/offline/sync/policy";

export type MutationRequest = {
  name: string;
  userId: string;
  entityType: string;
  entityId: string | null;
  operationType: OperationType;
  method: string;
  path: string;
  body: string | null;
};

export async function enqueueMutation(request: MutationRequest): Promise<OutboxOperation> {
  if (!mutationAllowed(request.name)) {
    throw new OfflineActionError("This action is not saved on this device.");
  }
  const fingerprint = operationFingerprint(request);
  const duplicate = await findActiveByFingerprint(fingerprint);
  if (duplicate) {
    return duplicate;
  }
  const operation: OutboxOperation = {
    operationId: createOperationId(),
    fingerprint,
    deviceId: await getDeviceId(),
    userId: request.userId,
    name: request.name,
    entityType: request.entityType,
    entityId: request.entityId,
    operationType: request.operationType,
    method: request.method,
    path: request.path,
    body: request.body,
    createdAt: new Date().toISOString(),
    status: "pending",
    retryCount: 0,
    nextAttemptAt: null,
    error: null,
  };
  return insertOperation(operation);
}
