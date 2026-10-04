export const MAX_ATTEMPTS = 5;

export const DEVICE_SQL = `
CREATE TABLE IF NOT EXISTS device_identity (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  device_id TEXT NOT NULL
);`;

export const CACHE_SQL = `
CREATE TABLE IF NOT EXISTS cache_entries (
  cache_key TEXT PRIMARY KEY NOT NULL,
  payload TEXT NOT NULL,
  saved_at TEXT NOT NULL
);`;

export const LOCAL_RECORDS_SQL = `
CREATE TABLE IF NOT EXISTS local_records (
  local_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  branch_id TEXT,
  kind TEXT NOT NULL,
  parent_id TEXT,
  server_id TEXT,
  payload TEXT NOT NULL,
  server_payload TEXT,
  operation_id TEXT,
  sync_status TEXT NOT NULL,
  error TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS local_records_user_kind ON local_records (user_id, kind);
CREATE INDEX IF NOT EXISTS local_records_operation ON local_records (operation_id);`;

export const OUTBOX_SQL = `
CREATE TABLE outbox (
  operation_id TEXT PRIMARY KEY NOT NULL,
  fingerprint TEXT NOT NULL,
  device_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  operation_type TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  body TEXT,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL,
  retry_count INTEGER NOT NULL,
  next_attempt_at TEXT,
  server_entity_id TEXT,
  error TEXT
);
CREATE INDEX IF NOT EXISTS outbox_fingerprint ON outbox (fingerprint);
CREATE INDEX IF NOT EXISTS outbox_user_status ON outbox (user_id, status);`;

export const SCHEMA_SQL = `${DEVICE_SQL}
${CACHE_SQL}
${LOCAL_RECORDS_SQL}
${OUTBOX_SQL}`;

export type OperationType = "create" | "update" | "cancel" | "correct";

export type OutboxStatus = "pending" | "in_flight" | "synced" | "conflict" | "failed";

export type OfflineMutationName = "vitals.record" | "consultation.note" | "prescriptions.submit";

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
  serverEntityId: string | null;
  error: string | null;
};

export type LocalKind = "vital" | "consultation_note" | "prescription_draft";

export type LocalSyncStatus = "draft" | "pending" | "synced" | "conflict" | "failed";

export type LocalRecord = {
  localId: string;
  userId: string;
  branchId: string | null;
  kind: LocalKind;
  parentId: string | null;
  serverId: string | null;
  payload: unknown;
  serverPayload: unknown;
  operationId: string | null;
  syncStatus: LocalSyncStatus;
  error: string | null;
  updatedAt: string;
};

export type PrescriptionSubmitBody = {
  encounterId: string;
  medicine: string;
  quantity: number;
  dosage: string;
  frequency: string;
  durationDays: number | null;
  itemOperationId: string;
  serverPrescriptionId?: string;
  serverItemId?: string;
};

export type CachedList<T> = {
  records: T[];
  source: "network" | "cache";
  notice: string | null;
};
