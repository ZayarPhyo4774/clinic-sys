"use client";

import { Building2 } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOperatorClinic } from "@/features/operator/operator-clinic-context";

export function OperatorClinicBar({ description }: { description?: string }) {
  const { clinicId, setClinicId, clinics, selectedClinic } = useOperatorClinic();

  if (clinics.length === 0) {
    return null;
  }

  return (
    <Card className="border-primary/15 bg-primary/5 shadow-premium-sm">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Building2 className="size-4 text-primary" aria-hidden="true" />
            Working on clinic
          </p>
          <p className="text-xs text-muted-foreground">
            {description ??
              "Lists and setup actions below are scoped to the selected clinic. Permission catalog is global."}
          </p>
        </div>
        <div className="w-full space-y-2 sm:max-w-xs">
          <Label htmlFor="operator-clinic-select" className="sr-only">
            Clinic
          </Label>
          <Select value={clinicId} onValueChange={setClinicId}>
            <SelectTrigger id="operator-clinic-select" className="w-full bg-background">
              <SelectValue placeholder="Select a clinic">
                {selectedClinic ? `${selectedClinic.name} (${selectedClinic.code})` : "Select a clinic"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {clinics.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.name} ({row.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
