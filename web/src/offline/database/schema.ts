export type OperationType = "create" | "update" | "cancel" | "correct";

export type OutboxStatus = "pending" | "in_flight" | "synced" | "conflict" | "failed";

export type OutboxOperation = {
  operationId: string;
  fingerprint: string;
  deviceId: string;
  userId: string;
  name: string;
  entityType: string;
  entityId: string | null;
  operationType: OperationType;
  method: string;
  path: string;
  body: string | null;
  createdAt: string;
  status: OutboxStatus;
  retryCount: number;
  nextAttemptAt: string | null;
  error: string | null;
};

export type CacheEntry<T> = {
  key: string;
  userId: string;
  branchId: string | null;
  resource: string;
  savedAt: string;
  payload: T;
};

export type DeviceRecord = {
  id: "device";
  deviceId: string;
};

export const MAX_ATTEMPTS = 5;
