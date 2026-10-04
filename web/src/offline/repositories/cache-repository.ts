import { databaseAvailable, STORE, withStore } from "@/offline/database/indexed-db";
import type { CacheEntry } from "@/offline/database/schema";

export function cacheKey(userId: string, branchId: string | null, resource: string, path: string) {
  return `${userId}:${branchId ?? ""}:${resource}:${path}`;
}

export async function writeCache<T>(entry: CacheEntry<T>) {
  if (!databaseAvailable()) {
    return;
  }
  await withStore(STORE.cache, "readwrite", (store) => store.put(entry));
}

export async function readCache<T>(key: string) {
  if (!databaseAvailable()) {
    return null;
  }
  const entry = await withStore<CacheEntry<T> | undefined>(STORE.cache, "readonly", (store) => store.get(key));
  return entry ?? null;
}

export async function rememberAccount<T extends { id: string }>(branchId: string | null, account: T) {
  await writeCache({
    key: `account:${branchId ?? ""}`,
    userId: account.id,
    branchId,
    resource: "account",
    savedAt: new Date().toISOString(),
    payload: account,
  });
}

export async function recallAccount<T>(branchId: string | null) {
  return readCache<T>(`account:${branchId ?? ""}`);
}

export async function clearCache() {
  if (!databaseAvailable()) {
    return;
  }
  await withStore(STORE.cache, "readwrite", (store) => store.clear());
}
