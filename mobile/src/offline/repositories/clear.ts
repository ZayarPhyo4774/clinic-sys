import { clearCache } from "@/offline/repositories/cache-repository";
import { openDatabase } from "@/offline/database/sqlite";

export function clearOfflineWork() {
  const db = openDatabase();
  clearCache();
  db.runSync("DELETE FROM outbox");
  db.runSync("DELETE FROM local_records");
}
