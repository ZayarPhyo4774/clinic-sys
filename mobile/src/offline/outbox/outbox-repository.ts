import type { OutboxOperation, OutboxStatus, OperationType } from "@/offline/database/schema";
import { openDatabase } from "@/offline/database/sqlite";

type OutboxRow = {
  operation_id: string;
  fingerprint: string;
  device_id: string;
  user_id: string;
  name: string;
  entity_type: string;
  entity_id: string | null;
  operation_type: OperationType;
  method: string;
  path: string;
  body: string | null;
  created_at: string;
  status: OutboxStatus;
  retry_count: number;
  next_attempt_at: string | null;
  server_entity_id: string | null;
  error: string | null;
};

export function mapOutbox(row: OutboxRow): OutboxOperation {
  return {
    operationId: row.operation_id,
    fingerprint: row.fingerprint,
    deviceId: row.device_id,
    userId: row.user_id,
    name: row.name,
    entityType: row.entity_type,
    entityId: row.entity_id,
    operationType: row.operation_type,
    method: row.method,
    path: row.path,
    body: row.body,
    createdAt: row.created_at,
    status: row.status,
    retryCount: row.retry_count,
    nextAttemptAt: row.next_attempt_at,
    serverEntityId: row.server_entity_id,
    error: row.error,
  };
}

export function getOperation(operationId: string) {
  const row = openDatabase().getFirstSync<OutboxRow>("SELECT * FROM outbox WHERE operation_id = ?", [operationId]);
  return row ? mapOutbox(row) : null;
}

export function findByFingerprint(userId: string, fingerprint: string) {
  const row = openDatabase().getFirstSync<OutboxRow>(
    `SELECT * FROM outbox
     WHERE user_id = ? AND fingerprint = ? AND status IN ('pending', 'in_flight', 'failed', 'conflict')
     ORDER BY created_at ASC LIMIT 1`,
    [userId, fingerprint],
  );
  return row ? mapOutbox(row) : null;
}

export function insertOperation(operation: OutboxOperation) {
  const existing = getOperation(operation.operationId);
  if (existing) {
    return existing;
  }
  openDatabase().runSync(
    `INSERT INTO outbox (
      operation_id, fingerprint, device_id, user_id, name, entity_type, entity_id, operation_type,
      method, path, body, created_at, status, retry_count, next_attempt_at, server_entity_id, error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      operation.operationId,
      operation.fingerprint,
      operation.deviceId,
      operation.userId,
      operation.name,
      operation.entityType,
      operation.entityId,
      operation.operationType,
      operation.method,
      operation.path,
      operation.body,
      operation.createdAt,
      operation.status,
      operation.retryCount,
      operation.nextAttemptAt,
      operation.serverEntityId,
      operation.error,
    ],
  );
  return operation;
}

export function updateOperation(operation: OutboxOperation) {
  openDatabase().runSync(
    `UPDATE outbox SET
      fingerprint = ?, status = ?, retry_count = ?, next_attempt_at = ?, server_entity_id = ?,
      error = ?, body = ?, path = ?
     WHERE operation_id = ?`,
    [
      operation.fingerprint,
      operation.status,
      operation.retryCount,
      operation.nextAttemptAt,
      operation.serverEntityId,
      operation.error,
      operation.body,
      operation.path,
      operation.operationId,
    ],
  );
}

export function listOutbox(userId: string | null) {
  const rows = userId
    ? openDatabase().getAllSync<OutboxRow>("SELECT * FROM outbox WHERE user_id = ? ORDER BY created_at ASC", [userId])
    : openDatabase().getAllSync<OutboxRow>("SELECT * FROM outbox ORDER BY created_at ASC");
  return rows.map(mapOutbox);
}
