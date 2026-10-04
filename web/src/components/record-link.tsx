"use client";

import Link from "next/link";

import { DoctorName } from "@/components/doctor-name";
import { EntityLabel } from "@/components/entity-label";

const linkClass = "font-medium text-primary hover:underline";

export function RecordLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={linkClass} onClick={(event) => event.stopPropagation()}>
      {children}
    </Link>
  );
}

export function PatientLink({ id }: { id: string }) {
  return (
    <RecordLink href={`/patients/${id}`}>
      <EntityLabel kind="patient" id={id} />
    </RecordLink>
  );
}

export function DoctorLabel({ id, fullName }: { id: string; fullName?: string | null }) {
  return <DoctorName id={id} fullName={fullName} />;
}

export function MedicineLink({ id }: { id: string }) {
  return (
    <RecordLink href={`/pharmacy/${id}`}>
      <EntityLabel kind="medicine" id={id} />
    </RecordLink>
  );
}

export function LabTestLabel({ id }: { id: string }) {
  return <EntityLabel kind="lab_test" id={id} />;
}
