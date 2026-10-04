"use client";

import { EntityLabel } from "@/components/entity-label";

export function DoctorName({
  id,
  fullName,
}: {
  id: string;
  fullName?: string | null;
}) {
  const name = fullName?.trim();
  if (name) {
    return <span title={id}>{name}</span>;
  }
  return <EntityLabel kind="doctor" id={id} />;
}
