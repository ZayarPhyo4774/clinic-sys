import { api, withQuery } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import type { Page } from "@/lib/api/types";
import type { CachedList } from "@/offline/database/schema";
import { cacheKey, patientCacheKey, readCache, writeCache } from "@/offline/repositories/cache-repository";
import { readSupported } from "@/offline/sync/policy";

const SAVED_COPY = "Showing a saved copy from this device.";

export async function loadCachedPage<T>(input: {
  userId: string | null;
  branchId: string | null;
  resource: string;
  path: string;
}): Promise<CachedList<T>> {
  const key =
    input.userId && readSupported(input.resource)
      ? cacheKey(input.userId, input.branchId, input.resource, input.path)
      : null;
  try {
    const page = await api<Page<T>>(input.path);
    if (key) {
      writeCache(key, page);
    }
    if (input.userId && (input.resource === "appointments-today" || input.resource === "queue")) {
      void cacheReferencedPatients(
        input.userId,
        input.branchId,
        page.results as { patient?: string }[],
      );
    }
    return { records: page.results, source: "network", notice: null };
  } catch (error) {
    if (key && error instanceof ApiError && error.status === 0) {
      const cached = readCache<Page<T>>(key);
      if (cached) {
        return { records: cached.results, source: "cache", notice: SAVED_COPY };
      }
    }
    throw error;
  }
}

export async function cacheReferencedPatients(
  userId: string,
  branchId: string | null,
  rows: { patient?: string }[],
) {
  const ids = [...new Set(rows.map((row) => row.patient).filter((id): id is string => Boolean(id)))].slice(0, 50);
  for (const patientId of ids) {
    const key = patientCacheKey(userId, branchId, patientId);
    try {
      const patient = await api<unknown>(`/patients/${patientId}/`);
      writeCache(key, patient);
    } catch (error) {
      if (error instanceof ApiError && [0, 403, 404].includes(error.status)) {
        continue;
      }
    }
  }
}

export type MedicineChoice = {
  id: string;
  name: string;
  code: string;
};

export async function loadMedicineChoices(userId: string | null, branchId: string | null) {
  const path = withQuery("/medicines/", { page_size: "100" });
  const key = userId ? cacheKey(userId, branchId, "medicines", path) : null;
  try {
    const page = await api<Page<MedicineChoice & { available_quantity?: number }>>(path);
    const choices = page.results.map((row) => ({ id: row.id, name: row.name, code: row.code }));
    if (key) {
      writeCache(key, choices);
    }
    return choices;
  } catch (error) {
    if (key && error instanceof ApiError && [0, 403, 404].includes(error.status)) {
      return readCache<MedicineChoice[]>(key) ?? [];
    }
    throw error;
  }
}
