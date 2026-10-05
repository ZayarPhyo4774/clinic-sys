"use client";

import { FormFieldError } from "@/components/form-field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PatientBirthMode } from "@/lib/patients/age";
import { cn } from "@/lib/utils";

export function PatientBirthFields({
  mode,
  onModeChange,
  dateOfBirth,
  onDateOfBirthChange,
  age,
  onAgeChange,
  error,
  idPrefix,
  className,
}: {
  mode: PatientBirthMode;
  onModeChange: (mode: PatientBirthMode) => void;
  dateOfBirth: string;
  onDateOfBirthChange: (value: string) => void;
  age: string;
  onAgeChange: (value: string) => void;
  error?: unknown;
  idPrefix: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      <div className="space-y-2">
        <Label>Birth information</Label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={mode === "dob" ? "default" : "outline"}
            onClick={() => onModeChange("dob")}
          >
            Date of birth
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "age" ? "default" : "outline"}
            onClick={() => onModeChange("age")}
          >
            Age only
          </Button>
        </div>
      </div>

      {mode === "dob" ? (
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}_dob`}>Date of birth</Label>
          <Input
            id={`${idPrefix}_dob`}
            type="date"
            value={dateOfBirth}
            onChange={(event) => onDateOfBirthChange(event.target.value)}
          />
          <FormFieldError error={error} name="date_of_birth" />
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}_age`}>Age (years)</Label>
          <Input
            id={`${idPrefix}_age`}
            inputMode="numeric"
            placeholder="Years"
            value={age}
            onChange={(event) => onAgeChange(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            An approximate date of birth will be stored when the exact date is unknown.
          </p>
          <FormFieldError error={error} name="age" />
        </div>
      )}
    </div>
  );
}
