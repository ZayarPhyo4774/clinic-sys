"use client";

import { AlertTriangle } from "lucide-react";

import type { PatientAllergy } from "@/lib/api/types";
import { cn } from "@/lib/utils";

export function activeAllergies(allergies: PatientAllergy[]) {
  return allergies.filter((row) => row.status === "active");
}

export function PatientAllergyAlert({ allergies }: { allergies: PatientAllergy[] }) {
  const active = activeAllergies(allergies);
  if (active.length === 0) {
    return null;
  }

  const severe = active.filter((row) => row.severity === "severe");

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border px-4 py-3 shadow-premium-sm",
        severe.length > 0 ? "border-destructive/30 bg-destructive/5" : "border-warning/30 bg-warning/5",
      )}
      role="alert"
    >
      <AlertTriangle
        className={cn("mt-0.5 size-5 shrink-0", severe.length > 0 ? "text-destructive" : "text-warning-foreground")}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="text-sm font-semibold">
          {severe.length > 0 ? "Severe allergy alert" : "Allergy on file"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {active.map((row) => `${row.substance}${row.reaction ? ` (${row.reaction})` : ""}`).join(" · ")}
        </p>
      </div>
    </div>
  );
}
