import { withQuery } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import type { Appointment, Patient, QueueEntry } from "@/lib/api/types";
import { localCalendarDate } from "@/lib/format";
import { patientCacheKey, readCache } from "@/offline/repositories/cache-repository";
import { cacheReferencedPatients, loadCachedPage } from "@/offline/repositories/read-repository";

async function optionalList<T extends { patient: string }>(input: {
  userId: string;
  branchId: string | null;
  resource: string;
  path: string;
}) {
  try {
    return await loadCachedPage<T>(input);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
      return { records: [] as T[], source: "network" as const, notice: null };
    }
    throw error;
  }
}

export async function loadAssignedPatients(userId: string, branchId: string | null) {
  const date = localCalendarDate();
  const appointments = await optionalList<Appointment>({
    userId,
    branchId,
    resource: "appointments-today",
    path: withQuery("/appointments/", { date }),
  });
  const queue = await optionalList<QueueEntry>({
    userId,
    branchId,
    resource: "queue",
    path: "/queue-entries/",
  });
  const ids = [
    ...new Set([...appointments.records, ...queue.records].map((row) => row.patient).filter(Boolean)),
  ];
  await cacheReferencedPatients(userId, branchId, ids.map((patient) => ({ patient })));
  const patients: Patient[] = [];
  const unresolved: string[] = [];
  for (const patientId of ids) {
    const patient = readCache<Patient>(patientCacheKey(userId, branchId, patientId));
    if (patient) {
      patients.push(patient);
    } else {
      unresolved.push(patientId);
    }
  }
  const fromCache = appointments.source === "cache" || queue.source === "cache";
  return {
    patients,
    unresolved,
    notice: fromCache ? "Showing patients saved for today's appointments and the queue." : null,
  };
}
