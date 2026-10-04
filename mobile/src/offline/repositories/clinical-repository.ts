import type { LocalKind, LocalRecord, LocalSyncStatus } from "@/offline/database/schema";
import { createLocalId, openDatabase } from "@/offline/database/sqlite";
import type { OfflineMutation } from "@/offline/sync/policy";
import { enqueueMutation } from "@/offline/outbox/enqueue";

type LocalRow = {
  local_id: string;
  user_id: string;
  branch_id: string | null;
  kind: LocalKind;
  parent_id: string | null;
  server_id: string | null;
  payload: string;
  server_payload: string | null;
  operation_id: string | null;
  sync_status: LocalSyncStatus;
  error: string | null;
  updated_at: string;
};

function mapLocal(row: LocalRow): LocalRecord {
  return {
    localId: row.local_id,
    userId: row.user_id,
    branchId: row.branch_id,
    kind: row.kind,
    parentId: row.parent_id,
    serverId: row.server_id,
    payload: JSON.parse(row.payload) as unknown,
    serverPayload: row.server_payload ? (JSON.parse(row.server_payload) as unknown) : null,
    operationId: row.operation_id,
    syncStatus: row.sync_status,
    error: row.error,
    updatedAt: row.updated_at,
  };
}

function localStatusFor(status: "pending" | "in_flight" | "synced" | "conflict" | "failed"): LocalSyncStatus {
  if (status === "in_flight") {
    return "pending";
  }
  return status;
}

function insertLocal(input: {
  localId: string;
  userId: string;
  branchId: string | null;
  kind: LocalKind;
  parentId: string | null;
  payload: unknown;
  operationId: string | null;
  syncStatus: LocalSyncStatus;
}) {
  openDatabase().runSync(
    `INSERT INTO local_records (
      local_id, user_id, branch_id, kind, parent_id, server_id, payload, server_payload,
      operation_id, sync_status, error, updated_at
    ) VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?, NULL, ?)`,
    [
      input.localId,
      input.userId,
      input.branchId,
      input.kind,
      input.parentId,
      JSON.stringify(input.payload),
      input.operationId,
      input.syncStatus,
      new Date().toISOString(),
    ],
  );
}

export function listLocalRecords(userId: string, kind: LocalKind) {
  const rows = openDatabase().getAllSync<LocalRow>(
    "SELECT * FROM local_records WHERE user_id = ? AND kind = ? ORDER BY updated_at DESC",
    [userId, kind],
  );
  return rows.map(mapLocal);
}

export function getLocalRecord(localId: string) {
  const row = openDatabase().getFirstSync<LocalRow>("SELECT * FROM local_records WHERE local_id = ?", [localId]);
  return row ? mapLocal(row) : null;
}

export function setLocalSync(
  operationId: string,
  syncStatus: LocalSyncStatus,
  error: string | null,
  serverPayload?: unknown,
) {
  if (serverPayload === undefined) {
    openDatabase().runSync(
      "UPDATE local_records SET sync_status = ?, error = ?, updated_at = ? WHERE operation_id = ?",
      [syncStatus, error, new Date().toISOString(), operationId],
    );
    return;
  }
  openDatabase().runSync(
    "UPDATE local_records SET sync_status = ?, error = ?, server_payload = ?, updated_at = ? WHERE operation_id = ?",
    [syncStatus, error, JSON.stringify(serverPayload), new Date().toISOString(), operationId],
  );
}

export function rememberServerProgress(operationId: string, payload: unknown, serverId: string | null) {
  openDatabase().runSync(
    "UPDATE local_records SET payload = ?, server_id = COALESCE(?, server_id), updated_at = ? WHERE operation_id = ?",
    [JSON.stringify(payload), serverId, new Date().toISOString(), operationId],
  );
}

function queueCreate(input: {
  userId: string;
  branchId: string | null;
  name: OfflineMutation;
  entityType: string;
  entityId: string;
  path: string;
  body: string;
  kind: LocalKind;
  payload: unknown;
}) {
  const queued = enqueueMutation({
    userId: input.userId,
    name: input.name,
    entityType: input.entityType,
    entityId: input.entityId,
    operationType: "create",
    method: "POST",
    path: input.path,
    body: input.body,
  });
  const existing = openDatabase().getFirstSync<{ local_id: string }>(
    "SELECT local_id FROM local_records WHERE operation_id = ?",
    [queued.operation.operationId],
  );
  if (!existing) {
    insertLocal({
      localId: queued.operation.operationId,
      userId: input.userId,
      branchId: input.branchId,
      kind: input.kind,
      parentId: input.entityId,
      payload: input.payload,
      operationId: queued.operation.operationId,
      syncStatus: localStatusFor(queued.operation.status),
    });
  } else {
    setLocalSync(queued.operation.operationId, localStatusFor(queued.operation.status), queued.operation.error);
  }
  return queued.operation;
}

export function queueVital(input: {
  userId: string;
  branchId: string | null;
  encounterId: string;
  measurements: Record<string, string>;
}) {
  const body = JSON.stringify(input.measurements);
  return queueCreate({
    userId: input.userId,
    branchId: input.branchId,
    name: "vitals.record",
    entityType: "encounters.VitalSign",
    entityId: input.encounterId,
    path: `/encounters/${input.encounterId}/vitals/`,
    body,
    kind: "vital",
    payload: input.measurements,
  });
}

export function queueConsultationNote(input: {
  userId: string;
  branchId: string | null;
  encounterId: string;
  body: string;
}) {
  const payload = { body: input.body };
  return queueCreate({
    userId: input.userId,
    branchId: input.branchId,
    name: "consultation.note",
    entityType: "encounters.ClinicalNote",
    entityId: input.encounterId,
    path: `/encounters/${input.encounterId}/notes/`,
    body: JSON.stringify(payload),
    kind: "consultation_note",
    payload,
  });
}

export function savePrescriptionDraft(input: {
  userId: string;
  branchId: string | null;
  localId?: string;
  encounterId: string;
  medicine: string;
  quantity: number;
  dosage: string;
  frequency: string;
  durationDays: number | null;
}) {
  const existing = input.localId ? getLocalRecord(input.localId) : null;
  if (existing && existing.syncStatus !== "draft") {
    return existing;
  }
  const currentPayload =
    existing && existing.payload && typeof existing.payload === "object"
      ? (existing.payload as { itemOperationId?: string })
      : null;
  const payload = {
    encounterId: input.encounterId,
    medicine: input.medicine,
    quantity: input.quantity,
    dosage: input.dosage,
    frequency: input.frequency,
    durationDays: input.durationDays,
    itemOperationId: currentPayload?.itemOperationId || createLocalId(),
  };
  if (existing) {
    openDatabase().runSync(
      "UPDATE local_records SET parent_id = ?, payload = ?, updated_at = ? WHERE local_id = ? AND sync_status = 'draft'",
      [input.encounterId, JSON.stringify(payload), new Date().toISOString(), existing.localId],
    );
    return getLocalRecord(existing.localId) ?? existing;
  }
  const localId = createLocalId();
  insertLocal({
    localId,
    userId: input.userId,
    branchId: input.branchId,
    kind: "prescription_draft",
    parentId: input.encounterId,
    payload,
    operationId: null,
    syncStatus: "draft",
  });
  return getLocalRecord(localId);
}

export function submitPrescriptionDraft(localId: string, userId: string) {
  const draft = getLocalRecord(localId);
  if (!draft || draft.userId !== userId || draft.kind !== "prescription_draft") {
    throw new Error("This prescription draft is not on this device.");
  }
  if (draft.syncStatus === "conflict") {
    throw new Error(draft.error || "This draft conflicts with the server record.");
  }
  if (draft.syncStatus === "synced") {
    throw new Error("This draft is already recorded.");
  }
  const payload = draft.payload as {
    encounterId: string;
    medicine: string;
    quantity: number;
    dosage: string;
    frequency: string;
    durationDays: number | null;
    itemOperationId: string;
  };
  const body = JSON.stringify({
    encounterId: payload.encounterId,
    medicine: payload.medicine,
    quantity: payload.quantity,
    dosage: payload.dosage,
    frequency: payload.frequency,
    durationDays: payload.durationDays,
    itemOperationId: payload.itemOperationId,
  });
  const queued = enqueueMutation({
    userId,
    name: "prescriptions.submit",
    entityType: "prescriptions.Prescription",
    entityId: payload.encounterId,
    operationType: "create",
    method: "POST",
    path: "/prescriptions/",
    body,
  });
  openDatabase().runSync(
    "UPDATE local_records SET operation_id = ?, sync_status = ?, error = ?, updated_at = ? WHERE local_id = ?",
    [
      queued.operation.operationId,
      localStatusFor(queued.operation.status),
      queued.operation.error,
      new Date().toISOString(),
      localId,
    ],
  );
  return queued.operation;
}
