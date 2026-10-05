"use client";

import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/features/auth/auth-provider";
import { fetchAllPages } from "@/lib/api/paginate";

export function useResourceList<T>(resource: string, path: string | null) {
  const { account, branchId } = useAuth();

  return useQuery({
    queryKey: [resource, "choices", path, branchId],
    enabled: Boolean(account && path),
    queryFn: async () => fetchAllPages<T>(path as string),
    staleTime: 60_000,
  });
}
