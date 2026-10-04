import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import type { Page } from "@/lib/api/types";
import { cacheKey, readCache, writeCache } from "@/offline/repositories/cache-repository";
import { readResourceFor } from "@/offline/sync/policy";

export type CachedPage<T> = {
  page: Page<T>;
  fromCache: boolean;
};

export async function loadCachedPage<T>(input: {
  path: string;
  userId: string | null;
  branchId: string | null;
}): Promise<CachedPage<T>> {
  const resource = readResourceFor(input.path);
  try {
    const page = await api<Page<T>>(input.path);
    if (resource && input.userId) {
      await writeCache({
        key: cacheKey(input.userId, input.branchId, resource, input.path),
        userId: input.userId,
        branchId: input.branchId,
        resource,
        savedAt: new Date().toISOString(),
        payload: page,
      });
    }
    return { page, fromCache: false };
  } catch (error) {
    const offline = error instanceof ApiError && error.status === 0;
    if (offline && resource && input.userId) {
      const cached = await readCache<Page<T>>(cacheKey(input.userId, input.branchId, resource, input.path));
      if (cached) {
        return { page: cached.payload, fromCache: true };
      }
    }
    throw error;
  }
}
