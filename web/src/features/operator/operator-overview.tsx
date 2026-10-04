"use client";

import { ArrowRight, CircleCheck, CircleDashed } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type OperatorSectionId } from "@/features/operator/constants";
import { useOperatorSection } from "@/features/operator/operator-section-context";
import { cn } from "@/lib/utils";

type SetupStep = {
  id: string;
  label: string;
  detail: string;
  done: boolean;
  section: OperatorSectionId;
};

export function OperatorOverview({
  clinicCount,
  branchCount,
  permissionCount,
  roleCount,
  userCount,
  assignmentCount,
}: {
  clinicCount: number;
  branchCount: number;
  permissionCount: number;
  roleCount: number;
  userCount: number;
  assignmentCount: number;
}) {
  const { navigate } = useOperatorSection();

  const steps: SetupStep[] = [
    {
      id: "clinic",
      label: "Create a clinic",
      detail: "Define the organization boundary.",
      done: clinicCount > 0,
      section: "clinics",
    },
    {
      id: "branch",
      label: "Add a branch",
      detail: "At least one site for patient records.",
      done: branchCount > 0,
      section: "branches",
    },
    {
      id: "access",
      label: "Install module access",
      detail: "Load permission codes into the catalog.",
      done: permissionCount > 0,
      section: "access",
    },
    {
      id: "roles",
      label: "Install default roles",
      detail: "Includes Solo Practitioner for one-doctor clinics.",
      done: roleCount > 0,
      section: "access",
    },
    {
      id: "staff",
      label: "Create staff login",
      detail: "Doctor or receptionist email + password.",
      done: userCount > 0,
      section: "staff",
    },
    {
      id: "assign",
      label: "Assign a role",
      detail: "Grant Solo Practitioner or another role.",
      done: assignmentCount > 0,
      section: "assignments",
    },
  ];

  const completed = steps.filter((step) => step.done).length;
  const ready = completed === steps.length;

  const stats: Array<{ label: string; value: number; section: OperatorSectionId }> = [
    { label: "Clinics", value: clinicCount, section: "clinics" },
    { label: "Branches", value: branchCount, section: "branches" },
    { label: "Permissions", value: permissionCount, section: "access" },
    { label: "Roles", value: roleCount, section: "roles" },
    { label: "Staff", value: userCount, section: "staff" },
    { label: "Assignments", value: assignmentCount, section: "assignments" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map((stat) => (
          <button
            key={stat.label}
            type="button"
            onClick={() => navigate(stat.section)}
            className="group block w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Card className="transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/20 group-hover:shadow-premium-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold tracking-tight">{stat.value}</p>
                <p className="mt-1 text-xs text-primary opacity-0 transition-opacity group-hover:opacity-100">
                  Open section →
                </p>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      <Card className={cn(ready ? "border-success/30 bg-success/5" : "border-primary/15")}>
        <CardHeader>
          <CardTitle>Solo clinic setup</CardTitle>
          <CardDescription>
            {ready
              ? "Provisioning complete. The doctor can sign in at the clinic workspace."
              : `${completed} of ${steps.length} steps done — follow the checklist below.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3">
            {steps.map((step, index) => (
              <li key={step.id}>
                <button
                  type="button"
                  onClick={() => navigate(step.section)}
                  className="flex w-full items-start gap-3 rounded-lg border bg-card/80 p-3 text-left transition-colors hover:bg-accent/40"
                >
                  {step.done ? (
                    <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
                  ) : (
                    <CircleDashed className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <span className="text-xs text-muted-foreground">{index + 1}.</span>
                      {step.label}
                      <ArrowRight className="size-3.5 text-primary opacity-60" aria-hidden="true" />
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{step.detail}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
