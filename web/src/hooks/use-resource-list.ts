"use client";

import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/features/auth/auth-provider";
import { api } from "@/lib/api/client";
import type { Page } from "@/lib/api/types";

export function useResourceList<T>(resource: string, path: string | null) {
  const { account, branchId } = useAuth();

  return useQuery({
    queryKey: [resource, "choices", path, branchId],
    enabled: Boolean(account && path),
    queryFn: async () => {
      const page = await api<Page<T>>(path as string);
      return page.results;
    },
    staleTime: 60_000,
  });
}
