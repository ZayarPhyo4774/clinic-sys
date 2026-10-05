"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleDashed } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

import { QueryState } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOperatorClinic } from "@/features/operator/operator-clinic-context";
import { api, withQuery } from "@/lib/api/client";
import { fieldMessages } from "@/lib/api/errors";
import { cn } from "@/lib/utils";

type SetupStatus = {
  clinic_id: string;
  has_branch: boolean;
  has_roles: boolean;
  has_permissions: boolean;
  has_user: boolean;
  has_assignment: boolean;
  branch_count: number;
  role_count: number;
  user_count: number;
  assignment_count: number;
};

type BranchRow = { id: string; clinic: string; name: string; code: string };
type RoleRow = { id: string; code: string; name: string };
type ListResponse<T> = { results: T[] };

const ROLE_OPTIONS = [
  { code: "solo-practitioner", label: "Solo Practitioner", staff: "doctor" as const },
  { code: "doctor", label: "Doctor", staff: "doctor" as const },
  { code: "nurse", label: "Nurse", staff: "nurse" as const },
  { code: "receptionist", label: "Receptionist", staff: null },
  { code: "clinic-admin", label: "Clinic Admin", staff: null },
];

function FieldError({ error, name }: { error: unknown; name: string }) {
  const messages = fieldMessages(error, name);
  if (messages.length === 0) {
    return null;
  }
  return <p className="text-sm text-destructive">{messages.join(" ")}</p>;
}

export function ClinicSetupWizard({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { clinicId, selectedClinic } = useOperatorClinic();
  const [step, setStep] = useState(0);

  const [branchName, setBranchName] = useState("Main");
  const [branchCode, setBranchCode] = useState("main");
  const [branchError, setBranchError] = useState<unknown>(null);

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [roleCode, setRoleCode] = useState("solo-practitioner");
  const [branchId, setBranchId] = useState("");
  const [createStaff, setCreateStaff] = useState(true);
  const [personError, setPersonError] = useState<unknown>(null);

  const setup = useQuery({
    queryKey: ["operator", "setup", clinicId],
    queryFn: () => api<SetupStatus>(`/operator/clinics/${clinicId}/setup/`),
    enabled: open && Boolean(clinicId),
  });

  const branches = useQuery({
    queryKey: ["operator", "branches", clinicId],
    queryFn: () => api<ListResponse<BranchRow>>(withQuery("/operator/branches/", { clinic: clinicId })),
    enabled: open && Boolean(clinicId),
  });

  const roles = useQuery({
    queryKey: ["operator", "roles", clinicId],
    queryFn: () => api<ListResponse<RoleRow>>(withQuery("/operator/roles/", { clinic: clinicId })),
    enabled: open && Boolean(clinicId),
  });

  const branchRows = branches.data?.results ?? [];
  const selectedRole = ROLE_OPTIONS.find((row) => row.code === roleCode);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (branchRows.length > 0 && !branchId) {
      setBranchId(branchRows[0].id);
    }
  }, [open, branchRows, branchId]);

  useEffect(() => {
    if (selectedRole?.staff) {
      setCreateStaff(true);
    }
  }, [selectedRole]);

  useEffect(() => {
    if (!open || !setup.data) {
      return;
    }
    if (!setup.data.has_branch) {
      setStep(0);
      return;
    }
    if (!setup.data.has_roles) {
      setStep(1);
      return;
    }
    if (!setup.data.has_assignment) {
      setStep(2);
      return;
    }
    setStep(3);
  }, [open, setup.data]);

  function invalidateAll() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ["operator"] }),
    ]);
  }

  const createBranch = useMutation({
    mutationFn: () =>
      api("/operator/branches/", {
        method: "POST",
        body: JSON.stringify({ clinic: clinicId, name: branchName, code: branchCode }),
      }),
    onSuccess: async () => {
      setBranchError(null);
      toast.success("Branch created.");
      await invalidateAll();
      setStep(1);
    },
    onError: setBranchError,
  });

  const installRoles = useMutation({
    mutationFn: () =>
      api(`/operator/clinics/${clinicId}/default-roles/`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: async () => {
      toast.success("Default roles installed.");
      await invalidateAll();
      setStep(2);
    },
  });

  const provisionPerson = useMutation({
    mutationFn: () =>
      api(`/operator/clinics/${clinicId}/people/`, {
        method: "POST",
        body: JSON.stringify({
          email,
          full_name: fullName,
          password,
          role_code: roleCode,
          branch: branchId || null,
          create_staff: createStaff && Boolean(selectedRole?.staff),
          staff_type: selectedRole?.staff,
        }),
      }),
    onSuccess: async () => {
      setPersonError(null);
      toast.success("Person provisioned with login and role.");
      await invalidateAll();
      setStep(3);
    },
    onError: setPersonError,
  });

  const steps = [
    { id: "branch", label: "Add branch", done: setup.data?.has_branch ?? false },
    { id: "roles", label: "Enable features", done: setup.data?.has_roles ?? false },
    { id: "person", label: "Add first person", done: setup.data?.has_assignment ?? false },
    { id: "done", label: "Done", done: setup.data?.has_assignment ?? false },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Clinic setup wizard</DialogTitle>
          <DialogDescription>
            {selectedClinic
              ? `Guided setup for ${selectedClinic.name}. New clinics already get default roles; add a branch and first login here.`
              : "Select a clinic to continue."}
          </DialogDescription>
        </DialogHeader>

        {setup.isLoading ? <QueryState status="loading" /> : null}

        {setup.data ? (
          <div className="space-y-6">
            <ol className="grid gap-2 sm:grid-cols-4">
              {steps.map((item, index) => (
                <li
                  key={item.id}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-xs",
                    index === step ? "border-primary bg-primary/5" : "border-muted bg-muted/20",
                  )}
                >
                  <span className="flex items-center gap-1.5 font-medium">
                    {item.done ? (
                      <CheckCircle2 className="size-3.5 text-success" aria-hidden="true" />
                    ) : (
                      <CircleDashed className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    )}
                    {item.label}
                  </span>
                </li>
              ))}
            </ol>

            {step === 0 ? (
              <form
                className="space-y-4"
                onSubmit={(event: FormEvent) => {
                  event.preventDefault();
                  createBranch.mutate();
                }}
              >
                <p className="text-sm text-muted-foreground">
                  Every clinic needs at least one branch for patient records and staff placement.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="wizard-branch-name">Branch name</Label>
                    <Input
                      id="wizard-branch-name"
                      value={branchName}
                      required
                      onChange={(event) => setBranchName(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wizard-branch-code">Branch code</Label>
                    <Input
                      id="wizard-branch-code"
                      value={branchCode}
                      required
                      onChange={(event) => setBranchCode(event.target.value)}
                    />
                    <FieldError error={branchError} name="code" />
                  </div>
                </div>
                <Button type="submit" disabled={createBranch.isPending || !clinicId}>
                  Create branch
                </Button>
              </form>
            ) : null}

            {step === 1 ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Default roles bundle module permissions for common clinic jobs (Solo Practitioner, Receptionist,
                  etc.). Re-run only if templates were updated.
                </p>
                <p className="text-sm">
                  {roles.data?.results.length ?? 0} role template(s) available · permission catalog{" "}
                  {setup.data.has_permissions ? "ready" : "missing"}
                </p>
                <Button type="button" onClick={() => installRoles.mutate()} disabled={installRoles.isPending}>
                  {setup.data.has_roles ? "Re-sync default roles" : "Install default roles"}
                </Button>
                {setup.data.has_roles ? (
                  <Button type="button" variant="outline" onClick={() => setStep(2)}>
                    Continue
                  </Button>
                ) : null}
              </div>
            ) : null}

            {step === 2 ? (
              <form
                className="space-y-4"
                onSubmit={(event: FormEvent) => {
                  event.preventDefault();
                  provisionPerson.mutate();
                }}
              >
                <p className="text-sm text-muted-foreground">
                  Creates the login, assigns a role, and optionally adds a Staff record for scheduling.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="wizard-role">Role template</Label>
                    <Select value={roleCode} onValueChange={setRoleCode}>
                      <SelectTrigger id="wizard-role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLE_OPTIONS.map((row) => (
                          <SelectItem key={row.code} value={row.code}>
                            {row.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldError error={personError} name="role_code" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wizard-name">Full name</Label>
                    <Input
                      id="wizard-name"
                      value={fullName}
                      required
                      onChange={(event) => setFullName(event.target.value)}
                    />
                    <FieldError error={personError} name="full_name" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wizard-email">Email</Label>
                    <Input
                      id="wizard-email"
                      type="email"
                      autoComplete="off"
                      value={email}
                      required
                      onChange={(event) => setEmail(event.target.value)}
                    />
                    <FieldError error={personError} name="email" />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="wizard-password">Password</Label>
                    <PasswordInput
                      id="wizard-password"
                      autoComplete="new-password"
                      value={password}
                      required
                      onChange={(event) => setPassword(event.target.value)}
                    />
                    <FieldError error={personError} name="password" />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="wizard-branch">Branch scope</Label>
                    <Select value={branchId} onValueChange={setBranchId}>
                      <SelectTrigger id="wizard-branch">
                        <SelectValue placeholder="Select branch" />
                      </SelectTrigger>
                      <SelectContent>
                        {branchRows.map((row) => (
                          <SelectItem key={row.id} value={row.id}>
                            {row.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldError error={personError} name="branch" />
                  </div>
                  {selectedRole?.staff ? (
                    <label className="flex items-center gap-2 text-sm sm:col-span-2">
                      <input
                        type="checkbox"
                        checked={createStaff}
                        onChange={(event) => setCreateStaff(event.target.checked)}
                      />
                      Also create Staff record ({selectedRole.staff}) for scheduling
                    </label>
                  ) : null}
                </div>
                <Button type="submit" disabled={provisionPerson.isPending || !branchId}>
                  Create login & assign role
                </Button>
              </form>
            ) : null}

            {step === 3 ? (
              <div className="space-y-3 rounded-lg border border-success/30 bg-success/5 p-4">
                <p className="font-medium text-success">Clinic is ready for sign-in</p>
                <p className="text-sm text-muted-foreground">
                  {setup.data.user_count} login(s), {setup.data.assignment_count} role assignment(s),{" "}
                  {setup.data.branch_count} branch(es). The person can sign in at the clinic workspace.
                </p>
                {selectedRole?.staff && !createStaff ? (
                  <p className="text-sm text-muted-foreground">
                    Tip: clinical roles also need a Staff record under Settings → Staff for appointments and queue
                    visibility.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
