export const OFFLINE_READS = [
  "patients",
  "appointments",
  "queue",
  "encounters",
  "prescriptions",
  "medicines",
  "lab-orders",
  "branches",
  "clinics",
] as const;

export type OfflineRead = (typeof OFFLINE_READS)[number];

const READ_PREFIXES: { prefix: string; resource: OfflineRead }[] = [
  { prefix: "/patients", resource: "patients" },
  { prefix: "/appointments", resource: "appointments" },
  { prefix: "/queue-entries", resource: "queue" },
  { prefix: "/encounters", resource: "encounters" },
  { prefix: "/prescriptions", resource: "prescriptions" },
  { prefix: "/medicines", resource: "medicines" },
  { prefix: "/lab-orders", resource: "lab-orders" },
  { prefix: "/branches", resource: "branches" },
  { prefix: "/clinics", resource: "clinics" },
];

export function readResourceFor(path: string): OfflineRead | null {
  const match = READ_PREFIXES.find((item) => path.startsWith(item.prefix));
  return match?.resource ?? null;
}

export const OFFLINE_MUTATIONS = ["vitals.record", "consultation.note"] as const;

export type OfflineMutation = (typeof OFFLINE_MUTATIONS)[number];

const BLOCKED_MUTATIONS: Record<string, string> = {
  "patients.register": "Patient registration needs a connection. The server assigns the patient number.",
  "queue.call": "Queue changes need a connection. The server assigns the queue position.",
  "queue.start": "Queue changes need a connection. The server assigns the queue position.",
  "queue.complete": "Queue changes need a connection. The server assigns the queue position.",
  "queue.skip": "Queue changes need a connection. The server assigns the queue position.",
  "queue.requeue": "Queue changes need a connection. The server assigns the queue position.",
  "encounters.correct": "A correction needs a connection. This device does not replace a clinical record.",
  "pharmacy.dispense": "Dispensing needs a connection. The server owns the stock balance.",
  "laboratory.result": "Lab results need a connection. The server owns the verified result.",
  "notifications.read": "Notification updates need a connection.",
};

export class OfflineActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfflineActionError";
  }
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
