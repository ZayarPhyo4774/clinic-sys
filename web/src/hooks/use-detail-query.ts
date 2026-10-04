"use client";

import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/features/auth/auth-provider";
import { api } from "@/lib/api/client";
import type { Page } from "@/lib/api/types";

export function useDetailQuery<T>(resource: string, path: string | null) {
  const { account, branchId } = useAuth();

  return useQuery({
    queryKey: [resource, "detail", path, branchId],
    enabled: Boolean(account && path),
    queryFn: () => api<T>(path as string),
  });
}

export function useRelatedListQuery<T>(resource: string, path: string | null) {
  const { account, branchId } = useAuth();

  return useQuery({
    queryKey: [resource, "list", path, branchId],
    enabled: Boolean(account && path),
    queryFn: async () => {
      const data = await api<Page<T> | T[]>(path as string);
      if (Array.isArray(data)) {
        return data;
      }
      return data.results ?? [];
    },
  });
}
