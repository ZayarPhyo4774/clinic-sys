import { enqueueMutation } from "@/offline/outbox/enqueue";
import type { OfflineMutation } from "@/offline/sync/policy";
import { runSync } from "@/offline/sync/worker";

function queueCreate(input: {
  userId: string;
  name: OfflineMutation;
  entityType: string;
  entityId: string;
  path: string;
  body: string;
}) {
  return enqueueMutation({
    userId: input.userId,
    name: input.name,
    entityType: input.entityType,
    entityId: input.entityId,
    operationType: "create",
    method: "POST",
    path: input.path,
    body: input.body,
  });
}

export async function queueVital(input: {
  userId: string;
  encounterId: string;
  measurements: Record<string, string | number>;
}) {
  const queued = await queueCreate({
    userId: input.userId,
    name: "vitals.record",
    entityType: "encounters.VitalSign",
    entityId: input.encounterId,
    path: `/encounters/${input.encounterId}/vitals/`,
    body: JSON.stringify(input.measurements),
  });
  void runSync();
  return queued;
}

export async function queueConsultationNote(input: {
  userId: string;
  encounterId: string;
  body: string;
}) {
  const payload = { body: input.body };
  const queued = await queueCreate({
    userId: input.userId,
    name: "consultation.note",
    entityType: "encounters.ClinicalNote",
    entityId: input.encounterId,
    path: `/encounters/${input.encounterId}/notes/`,
    body: JSON.stringify(payload),
  });
  void runSync();
  return queued;
}
