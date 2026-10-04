import { createLocalId, openDatabase } from "@/offline/database/sqlite";

type DeviceRow = { device_id: string };

export function getDeviceId() {
  const existing = openDatabase().getFirstSync<DeviceRow>("SELECT device_id FROM device_identity WHERE id = 1");
  if (existing) {
    return existing.device_id;
  }
  const created = createLocalId();
  openDatabase().runSync("INSERT INTO device_identity (id, device_id) VALUES (1, ?)", [created]);
  return created;
}
