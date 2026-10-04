import { databaseAvailable, STORE, withStore } from "@/offline/database/indexed-db";
import type { DeviceRecord } from "@/offline/database/schema";

function createDeviceId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `device-${Date.now()}`;
}

export async function getDeviceId() {
  if (!databaseAvailable()) {
    return "unavailable-device";
  }
  const existing = await withStore<DeviceRecord | undefined>(STORE.device, "readonly", (store) => store.get("device"));
  if (existing?.deviceId) {
    return existing.deviceId;
  }
  const created: DeviceRecord = { id: "device", deviceId: createDeviceId() };
  await withStore(STORE.device, "readwrite", (store) => store.put(created));
  return created.deviceId;
}
