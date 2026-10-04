export const OFFLINE_READS = [
  "patients",
  "appointments",
  "appointments-today",
  "queue",
  "encounters",
  "prescriptions",
  "medicines",
] as const;

export type OfflineRead = (typeof OFFLINE_READS)[number];

export const OFFLINE_MUTATIONS = ["vitals.record", "consultation.note", "prescriptions.submit"] as const;

export type OfflineMutation = (typeof OFFLINE_MUTATIONS)[number];

const BLOCKED_MUTATIONS: Record<string, string> = {
  "patients.register": "Patient registration needs a connection. The server assigns the patient number.",
  "appointments.book": "Booking needs a connection. The server assigns the visit time.",
  "queue.call": "Queue changes need a connection. The server assigns the queue position.",
  "queue.start": "Queue changes need a connection. The server assigns the queue position.",
  "queue.complete": "Queue changes need a connection. The server assigns the queue position.",
  "queue.skip": "Queue changes need a connection. The server assigns the queue position.",
  "queue.requeue": "Queue changes need a connection. The server assigns the queue position.",
  "encounters.correct": "A correction needs a connection. This device does not replace a clinical record.",
  "pharmacy.dispense": "Dispensing needs a connection. The server owns the stock balance.",
  "laboratory.result": "Lab results need a connection. The server owns the verified result.",
};

export class OfflineActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfflineActionError";
  }
}

export function readSupported(resource: string): resource is OfflineRead {
  return (OFFLINE_READS as readonly string[]).includes(resource);
}

export function mutationAllowed(name: string): name is OfflineMutation {
  return (OFFLINE_MUTATIONS as readonly string[]).includes(name);
}

export function requireOnlineMutation(name: string, online: boolean) {
  if (online || mutationAllowed(name)) {
    return;
  }
  throw new OfflineActionError(
    BLOCKED_MUTATIONS[name] ?? "This action needs a connection. It is not saved on this device.",
  );
}
