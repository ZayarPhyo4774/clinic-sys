"use client";

import { useMemo } from "react";

import { useResourceList } from "@/hooks/use-resource-list";
import { withQuery } from "@/lib/api/client";
import type { Medicine } from "@/lib/api/types";
import { formatMedicineLabel } from "@/features/prescriptions/prescription-utils";

export function useMedicineLabelMap() {
  const medicines = useResourceList<Medicine>("medicines", withQuery("/medicines/", { page_size: "100" }));

  const { labelById, unitById } = useMemo(() => {
    const labels = new Map<string, string>();
    const units = new Map<string, string>();
    for (const medicine of medicines.data ?? []) {
      labels.set(medicine.id, formatMedicineLabel(medicine));
      units.set(medicine.id, medicine.unit);
    }
    return { labelById: labels, unitById: units };
  }, [medicines.data]);

  return {
    labelById,
    unitById,
    isLoading: medicines.isLoading,
    labelFor(id: string) {
      return labelById.get(id) ?? id;
    },
    unitFor(id: string) {
      return unitById.get(id) ?? "";
    },
  };
}
