"use client";

import { ExternalLink, User } from "lucide-react";
import Link from "next/link";

import { PatientAllergyAlert } from "@/components/patient-allergy-alert";
import { StatusText } from "@/components/record-browser";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { VitalsGridReadonly } from "@/components/vitals/vitals-grid";
import { useVitalUnits } from "@/hooks/use-vital-units";
import type { Encounter, Patient, PatientProfile } from "@/lib/api/types";
import { formatPatientBirthSummary } from "@/lib/patients/age";
export { formatPatientAgeLabel, patientAge } from "@/lib/patients/age";
import { computeBmi, DEFAULT_VITAL_UNITS, type VitalRowValues } from "@/lib/vitals/units";
import { cn, formatWhen } from "@/lib/utils";

export function formatSex(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function activeMedicalHistory(profile: PatientProfile) {
  return profile.medical_history.filter((row) => row.status === "active");
}

type VitalRow = VitalRowValues & {
  recorded_at: string;
};

export function VitalSnapshot({ vitals }: { vitals: VitalRow[] }) {
  const vitalUnitsQuery = useVitalUnits();
  const vitalUnits = vitalUnitsQuery.data ?? DEFAULT_VITAL_UNITS;
  const latest = vitals[0];
  if (!latest) {
    return (
      <p className="text-sm text-muted-foreground">No vitals recorded for this visit.</p>
    );
  }

  const bmi = computeBmi(
    latest.weight_kg != null ? String(latest.weight_kg) : null,
    latest.height_cm != null ? String(latest.height_cm) : null,
  );
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Latest · {formatWhen(latest.recorded_at)}</p>
      <VitalsGridReadonly row={latest} fields={vitalUnits} bmi={bmi} />
    </div>
  );
}

export function ConsultationPatientBanner({
  patient,
  profile,
  encounter,
}: {
  patient: Patient;
  profile: PatientProfile;
  encounter: Encounter;
}) {
  const history = activeMedicalHistory(profile);

  return (
    <div className="space-y-4">
      <PatientAllergyAlert allergies={profile.allergies} />

      <Card className="shadow-premium-sm">
        <CardContent className="flex flex-col gap-4 p-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <User className="size-5 text-muted-foreground" aria-hidden="true" />
              <h2 className="text-lg font-semibold">{patient.full_name}</h2>
              <Badge variant="outline">{patient.patient_number}</Badge>
              <StatusText value={encounter.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {formatPatientBirthSummary(patient)} · {formatSex(patient.sex)}
            </p>
            {history.length > 0 ? (
              <p className="text-sm">
                <span className="text-muted-foreground">Active conditions: </span>
                {history.map((row) => row.title).join(" · ")}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">No active medical history on file.</p>
            )}
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link href={`/patients/${patient.id}`}>
              <ExternalLink className="size-4" aria-hidden="true" />
              Full patient chart
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
