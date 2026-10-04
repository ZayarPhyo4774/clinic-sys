import { openDatabase } from "@/offline/database/sqlite";

type CacheRow = { payload: string };

export function cacheKey(userId: string, branchId: string | null, resource: string, path: string) {
  return `${userId}:${branchId ?? ""}:${resource}:${path}`;
}

export function patientCacheKey(userId: string, branchId: string | null, patientId: string) {
  return cacheKey(userId, branchId, "patient", patientId);
}

export function accountCacheKey(branchId: string | null) {
  return `account:${branchId ?? ""}`;
}

export function readCache<T>(key: string): T | null {
  const row = openDatabase().getFirstSync<CacheRow>("SELECT payload FROM cache_entries WHERE cache_key = ?", [key]);
  if (!row) {
    return null;
  }
  try {
    return JSON.parse(row.payload) as T;
  } catch {
    return null;
  }
}

export function writeCache(key: string, value: unknown) {
  openDatabase().runSync(
    "INSERT INTO cache_entries (cache_key, payload, saved_at) VALUES (?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, saved_at = excluded.saved_at",
    [key, JSON.stringify(value), new Date().toISOString()],
  );
}

export function clearCache() {
  openDatabase().runSync("DELETE FROM cache_entries");
}
