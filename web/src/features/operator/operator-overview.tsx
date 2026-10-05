"use client";

import { ArrowRight, CircleCheck, CircleDashed, Wand2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClinicSetupWizard } from "@/features/operator/clinic-setup-wizard";
import { type OperatorSectionId } from "@/features/operator/constants";
import { OperatorClinicBar } from "@/features/operator/operator-clinic-bar";
import { useOperatorClinic } from "@/features/operator/operator-clinic-context";
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
  clinicBranchCount,
  clinicRoleCount,
  clinicUserCount,
  clinicAssignmentCount,
  clinicHasRoles,
}: {
  clinicCount: number;
  branchCount: number;
  permissionCount: number;
  roleCount: number;
  userCount: number;
  assignmentCount: number;
  clinicBranchCount: number;
  clinicRoleCount: number;
  clinicUserCount: number;
  clinicAssignmentCount: number;
  clinicHasRoles: boolean;
}) {
  const { navigate } = useOperatorSection();
  const { selectedClinic } = useOperatorClinic();
  const [wizardOpen, setWizardOpen] = useState(false);

  const scoped = Boolean(selectedClinic);
  const branches = scoped ? clinicBranchCount : branchCount;
  const roles = scoped ? clinicRoleCount : roleCount;
  const users = scoped ? clinicUserCount : userCount;
  const assignments = scoped ? clinicAssignmentCount : assignmentCount;

  const steps: SetupStep[] = [
    {
      id: "clinic",
      label: "Create a clinic",
      detail: "Organization boundary; default roles install automatically.",
      done: clinicCount > 0,
      section: "clinics",
    },
    {
      id: "branch",
      label: "Add a branch",
      detail: "At least one site for patient records and staff.",
      done: branches > 0,
      section: "branches",
    },
    {
      id: "features",
      label: "Enable features & default roles",
      detail: "Permission catalog plus Solo Practitioner, Receptionist, etc.",
      done: permissionCount > 0 && (scoped ? clinicHasRoles : roleCount > 0),
      section: "access",
    },
    {
      id: "person",
      label: "Add first person",
      detail: "One step: login + role (+ optional Staff record for clinical roles).",
      done: users > 0 && assignments > 0,
      section: "staff",
    },
  ];

  const completed = steps.filter((step) => step.done).length;
  const ready = completed === steps.length;

  const stats: Array<{ label: string; value: number; section: OperatorSectionId }> = [
    { label: "Clinics", value: clinicCount, section: "clinics" },
    { label: scoped ? "Branches (clinic)" : "Branches", value: branches, section: "branches" },
    { label: "Permissions", value: permissionCount, section: "access" },
    { label: scoped ? "Roles (clinic)" : "Roles", value: roles, section: "roles" },
    { label: scoped ? "Logins (clinic)" : "Logins", value: users, section: "staff" },
    { label: scoped ? "Assignments (clinic)" : "Assignments", value: assignments, section: "assignments" },
  ];

  return (
    <div className="space-y-6">
      <OperatorClinicBar description="Setup checklist below reflects the selected clinic where noted." />

      <Card className="border-primary/20 bg-primary/5 shadow-premium-sm">
        <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">Guided clinic setup</p>
            <p className="text-sm text-muted-foreground">
              Run the wizard to add a branch, confirm default roles, and provision the first login in one flow.
            </p>
          </div>
          <Button type="button" onClick={() => setWizardOpen(true)} disabled={clinicCount === 0}>
            <Wand2 className="size-4" aria-hidden="true" />
            Open setup wizard
          </Button>
        </CardContent>
      </Card>

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
          <CardTitle>{selectedClinic ? `${selectedClinic.name} setup` : "Platform setup"}</CardTitle>
          <CardDescription>
            {ready
              ? "Provisioning complete. Clinic users can sign in at the clinic workspace."
              : `${completed} of ${steps.length} steps done — use the wizard or follow the checklist.`}
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

      <ClinicSetupWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </div>
  );
}
