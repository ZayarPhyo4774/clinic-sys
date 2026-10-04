"use client";

import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/features/auth/auth-provider";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { formatDoctorPersonName } from "@/lib/doctor-display";
import { shortId } from "@/lib/utils";

type DoctorProfile = {
  id: string;
  staff: string;
  staff_full_name?: string;
  staff_email?: string;
};

type PatientRecord = {
  full_name: string;
};

type MedicineRecord = {
  name: string;
  code: string;
};

type LabTestRecord = {
  name: string;
  code: string;
};

async function fetchPatientLabel(id: string) {
  const patient = await api<PatientRecord>(`/patients/${id}/`);
  return patient.full_name;
}

async function fetchDoctorLabel(id: string) {
  const profile = await api<DoctorProfile>(`/doctor-profiles/${id}/`);
  return formatDoctorPersonName(profile);
}

async function fetchMedicineLabel(id: string) {
  const medicine = await api<MedicineRecord>(`/medicines/${id}/`);
  return `${medicine.name} (${medicine.code})`;
}

async function fetchLabTestLabel(id: string) {
  const test = await api<LabTestRecord>(`/lab-tests/${id}/`);
  return `${test.name} (${test.code})`;
}

export function EntityLabel({
  kind,
  id,
}: {
  kind: "patient" | "doctor" | "medicine" | "lab_test";
  id: string;
}) {
  const { branchId } = useAuth();
  const query = useQuery({
    queryKey: ["entity-label", kind, id, branchId],
    queryFn: () => {
      if (kind === "patient") {
        return fetchPatientLabel(id);
      }
      if (kind === "doctor") {
        return fetchDoctorLabel(id);
      }
      if (kind === "medicine") {
        return fetchMedicineLabel(id);
      }
      return fetchLabTestLabel(id);
    },
    staleTime: 5 * 60_000,
    retry: (count, error) => {
      if (error instanceof ApiError && [403, 404].includes(error.status)) {
        return false;
      }
      return count < 1;
    },
  });

  if (query.isLoading) {
    return (
      <span
        aria-hidden="true"
        className="inline-block h-4 w-24 animate-pulse rounded-md bg-accent"
      />
    );
  }

  if (query.data) {
    return <span title={id}>{query.data}</span>;
  }

  return <span title={id}>{shortId(id)}</span>;
}
