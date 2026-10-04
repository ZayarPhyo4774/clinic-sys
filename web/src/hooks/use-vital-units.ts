"use client";

import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/features/auth/auth-provider";
import { api } from "@/lib/api/client";
import type { VitalUnitsResponse } from "@/lib/api/types";
import { DEFAULT_VITAL_UNITS } from "@/lib/vitals/units";

export function useVitalUnits() {
  const { account, branchId } = useAuth();
  const canView = Boolean(account);

  return useQuery({
    queryKey: ["vital-units", branchId],
    enabled: canView,
    staleTime: 60 * 60 * 1000,
    queryFn: () => api<VitalUnitsResponse>("/vital-units/"),
    select: (data) => data.fields,
    placeholderData: { fields: DEFAULT_VITAL_UNITS },
  });
}
