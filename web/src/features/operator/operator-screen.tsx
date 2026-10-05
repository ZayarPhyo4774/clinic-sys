"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { ClinicSetupWizard } from "@/features/operator/clinic-setup-wizard";
import { OperatorClinicBar } from "@/features/operator/operator-clinic-bar";
import { OperatorClinicProvider, useOperatorClinic } from "@/features/operator/operator-clinic-context";
import { OperatorOverview } from "@/features/operator/operator-overview";
import { useOperatorSection } from "@/features/operator/use-operator-section";
import { QueryState } from "@/components/query-state";
import { StatusText } from "@/components/record-browser";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/features/auth/auth-provider";
import { api, withQuery } from "@/lib/api/client";
import { ApiError, fieldMessages } from "@/lib/api/errors";

type ClinicRow = { id: string; name: string; code: string; timezone: string; currency: string; is_active: boolean };
type BranchRow = { id: string; clinic: string; name: string; code: string; is_active: boolean };
type PermissionRow = { code: string; description: string };
type RoleRow = { id: string; clinic: string; name: string; code: string; permissions: string[] };
type UserRow = {
  id: string;
  email: string;
  full_name: string;
  clinic_id: string | null;
  is_active: boolean;
  is_superuser: boolean;
};
type AssignmentRow = {
  id: string;
  user_email: string;
  role_name: string;
  role_code?: string;
  branch_name: string | null;
};

const CLINICAL_ROLE_CODES = new Set([
  "solo-practitioner",
  "doctor",
  "nurse",
  "pharmacist",
  "lab-technician",
]);

type ListResponse<T> = { results: T[] };
type DefaultRoleInstallResult = {
  created: number;
  updated: number;
  skipped: number;
  total_templates: number;
  created_permissions: number;
};
type DefaultRolePreviewItem = {
  code: string;
  name: string;
  existing_name: string | null;
  status: "create" | "update" | "skip" | "unchanged";
  added_permissions: string[];
  removed_permissions: string[];
};
type DefaultRolePreviewResult = {
  update_existing: boolean;
  created: number;
  updated: number;
  skipped: number;
  unchanged: number;
  total_templates: number;
  missing_permission_codes: string[];
  items: DefaultRolePreviewItem[];
};

function FieldError({ error, name }: { error: unknown; name: string }) {
  const messages = fieldMessages(error, name);
  if (messages.length === 0) {
    return null;
  }
  return <p className="text-sm text-destructive">{messages.join(" ")}</p>;
}

function FormNote({ error }: { error: unknown }) {
  if (!(error instanceof Error) || fieldMessages(error, "non_field_errors").length > 0) {
    return error instanceof Error ? <p className="text-sm text-destructive">{error.message}</p> : null;
  }
  const named = ["name", "code", "email", "password", "full_name", "permissions", "role", "clinic", "branch", "user"];
  if (named.some((name) => fieldMessages(error, name).length > 0)) {
    return null;
  }
  return <p className="text-sm text-destructive">{error.message}</p>;
}

function ActiveBadge({ active }: { active: boolean }) {
  return <Badge variant={active ? "success" : "outline"}>{active ? "Active" : "Inactive"}</Badge>;
}

function ToggleActiveButton({
  active,
  label,
  onConfirm,
  pending,
}: {
  active: boolean;
  label: string;
  onConfirm: () => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const nextActive = !active;
  return (
    <>
      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setOpen(true)}>
        {nextActive ? "Activate" : "Deactivate"}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={nextActive ? `Activate ${label}?` : `Deactivate ${label}?`}
        description={
          nextActive
            ? "This record will be available again in clinic workflows."
            : "Staff may lose access until this record is activated again."
        }
        confirmLabel={nextActive ? "Activate" : "Deactivate"}
        destructive={!nextActive}
        pending={pending}
        onConfirm={() => {
          onConfirm();
          setOpen(false);
        }}
      />
    </>
  );
}

export function OperatorScreen() {
  const clinics = useQuery({
    queryKey: ["operator", "clinics"],
    queryFn: () => api<ListResponse<ClinicRow>>("/operator/clinics/"),
  });

  if (clinics.isLoading) {
    return <QueryState status="loading" />;
  }

  const clinicRows = clinics.data?.results ?? [];

  return (
    <OperatorClinicProvider clinics={clinicRows.map(({ id, name, code }) => ({ id, name, code }))}>
      <OperatorWorkspace />
    </OperatorClinicProvider>
  );
}

function OperatorWorkspace() {
  const { section } = useOperatorSection();
  const { clinicId, setClinicId } = useOperatorClinic();
  const { refetchAccount } = useAuth();
  const queryClient = useQueryClient();

  const clinics = useQuery({
    queryKey: ["operator", "clinics"],
    queryFn: () => api<ListResponse<ClinicRow>>("/operator/clinics/"),
  });
  const branches = useQuery({
    queryKey: ["operator", "branches", clinicId],
    queryFn: () =>
      api<ListResponse<BranchRow>>(
        clinicId ? withQuery("/operator/branches/", { clinic: clinicId }) : "/operator/branches/",
      ),
  });
  const permissions = useQuery({
    queryKey: ["operator", "permissions"],
    queryFn: () => api<ListResponse<PermissionRow>>("/operator/permissions/"),
  });
  const roles = useQuery({
    queryKey: ["operator", "roles", clinicId],
    queryFn: () =>
      api<ListResponse<RoleRow>>(
        clinicId ? withQuery("/operator/roles/", { clinic: clinicId }) : "/operator/roles/",
      ),
  });
  const users = useQuery({
    queryKey: ["operator", "users", clinicId],
    queryFn: () =>
      api<ListResponse<UserRow>>(
        clinicId ? withQuery("/operator/users/", { clinic: clinicId }) : "/operator/users/",
      ),
  });
  const assignments = useQuery({
    queryKey: ["operator", "assignments", clinicId],
    queryFn: () =>
      api<ListResponse<AssignmentRow>>(
        clinicId ? withQuery("/operator/assignments/", { clinic: clinicId }) : "/operator/assignments/",
      ),
  });
  const clinicSetup = useQuery({
    queryKey: ["operator", "setup", clinicId],
    queryFn: () =>
      api<{
        branch_count: number;
        role_count: number;
        user_count: number;
        assignment_count: number;
        has_roles: boolean;
      }>(`/operator/clinics/${clinicId}/setup/`),
    enabled: Boolean(clinicId),
  });

  const [clinicName, setClinicName] = useState("");
  const [clinicCode, setClinicCode] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [currency, setCurrency] = useState("USD");
  const [clinicError, setClinicError] = useState<unknown>(null);
  const [editingClinic, setEditingClinic] = useState<ClinicRow | null>(null);
  const [editClinicName, setEditClinicName] = useState("");
  const [editClinicTimezone, setEditClinicTimezone] = useState("UTC");
  const [editClinicCurrency, setEditClinicCurrency] = useState("USD");
  const [editClinicActive, setEditClinicActive] = useState(true);
  const [editClinicError, setEditClinicError] = useState<unknown>(null);
  const [deleteClinicId, setDeleteClinicId] = useState<string | null>(null);
  const [deleteClinicError, setDeleteClinicError] = useState<string | null>(null);

  const [branchClinic, setBranchClinic] = useState("");
  const [branchName, setBranchName] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [branchError, setBranchError] = useState<unknown>(null);

  const [roleClinic, setRoleClinic] = useState("");
  const [roleName, setRoleName] = useState("");
  const [roleCode, setRoleCode] = useState("");
  const [rolePermissions, setRolePermissions] = useState<string[]>([]);
  const [roleError, setRoleError] = useState<unknown>(null);
  const [editingRole, setEditingRole] = useState<RoleRow | null>(null);
  const [editRoleName, setEditRoleName] = useState("");
  const [editRolePermissions, setEditRolePermissions] = useState<string[]>([]);
  const [editRoleError, setEditRoleError] = useState<unknown>(null);
  const [deleteRoleId, setDeleteRoleId] = useState<string | null>(null);
  const [deleteRoleError, setDeleteRoleError] = useState<string | null>(null);

  const [userClinic, setUserClinic] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [userError, setUserError] = useState<unknown>(null);

  const [assignUser, setAssignUser] = useState("");
  const [assignRole, setAssignRole] = useState("");
  const [assignBranch, setAssignBranch] = useState("");
  const [assignError, setAssignError] = useState<unknown>(null);
  const [removeAssignmentId, setRemoveAssignmentId] = useState<string | null>(null);
  const [overwriteDefaultRoles, setOverwriteDefaultRoles] = useState(false);
  const [defaultRolePreview, setDefaultRolePreview] = useState<DefaultRolePreviewResult | null>(null);
  const [defaultRolePreviewOpen, setDefaultRolePreviewOpen] = useState(false);
  const [setupWizardOpen, setSetupWizardOpen] = useState(false);
  const [clinicalPromptOpen, setClinicalPromptOpen] = useState(false);
  const [clinicalPromptEmail, setClinicalPromptEmail] = useState("");

  function refresh(key: string) {
    return queryClient.invalidateQueries({ queryKey: ["operator", key] });
  }

  const clinicRows = clinics.data?.results ?? [];
  const branchRows = branches.data?.results ?? [];
  const permissionRows = permissions.data?.results ?? [];
  const roleRows = roles.data?.results ?? [];
  const userRows = users.data?.results ?? [];
  const assignmentRows = assignments.data?.results ?? [];

  useEffect(() => {
    if (clinicId) {
      setBranchClinic(clinicId);
      setRoleClinic(clinicId);
      setUserClinic(clinicId);
    }
  }, [clinicId]);

  const createClinic = useMutation({
    mutationFn: () =>
      api("/operator/clinics/", {
        method: "POST",
        body: JSON.stringify({ name: clinicName, code: clinicCode, timezone, currency }),
      }),
    onSuccess: async () => {
      setClinicName("");
      setClinicCode("");
      setClinicError(null);
      toast.success("Clinic created.");
      await refresh("clinics");
    },
    onError: setClinicError,
  });

  const toggleClinic = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api(`/operator/clinics/${id}/`, { method: "PATCH", body: JSON.stringify({ is_active }) }),
    onSuccess: async () => {
      toast.success("Clinic updated.");
      await refresh("clinics");
    },
  });

  const updateClinic = useMutation({
    mutationFn: (clinic: ClinicRow) =>
      api(`/operator/clinics/${clinic.id}/`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editClinicName,
          timezone: editClinicTimezone,
          currency: editClinicCurrency,
          is_active: editClinicActive,
        }),
      }),
    onSuccess: async () => {
      setEditClinicError(null);
      setEditingClinic(null);
      toast.success("Clinic updated.");
      await refresh("clinics");
    },
    onError: setEditClinicError,
  });

  const deleteClinic = useMutation({
    mutationFn: (clinicId: string) => api(`/operator/clinics/${clinicId}/`, { method: "DELETE" }),
    onSuccess: async (_data, clinicId) => {
      setDeleteClinicId(null);
      setDeleteClinicError(null);
      if (editingClinic?.id === clinicId) {
        setEditingClinic(null);
      }
      toast.success("Clinic deleted.");
      await refresh("clinics");
      await refresh("branches");
      await refresh("roles");
      await refresh("users");
    },
    onError: (error) => {
      const message =
        fieldMessages(error, "clinic")[0] ||
        (error instanceof Error ? error.message : "The clinic could not be deleted.");
      setDeleteClinicError(message);
      toast.error(message);
    },
  });

  const createBranch = useMutation({
    mutationFn: () =>
      api("/operator/branches/", {
        method: "POST",
        body: JSON.stringify({ clinic: branchClinic, name: branchName, code: branchCode }),
      }),
    onSuccess: async () => {
      setBranchName("");
      setBranchCode("");
      setBranchError(null);
      toast.success("Branch created.");
      await refresh("branches");
    },
    onError: setBranchError,
  });

  const toggleBranch = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api(`/operator/branches/${id}/`, { method: "PATCH", body: JSON.stringify({ is_active }) }),
    onSuccess: async () => {
      toast.success("Branch updated.");
      await refresh("branches");
    },
  });

  const installPermissions = useMutation({
    mutationFn: () => api("/operator/permissions/", { method: "POST", body: JSON.stringify({}) }),
    onSuccess: async () => {
      toast.success("Module access installed.");
      await refresh("permissions");
      refetchAccount();
    },
  });

  const installDefaultRoles = useMutation({
    mutationFn: () =>
      api(`/operator/clinics/${clinicId}/default-roles/`, {
        method: "POST",
        body: JSON.stringify({ update_existing: overwriteDefaultRoles }),
      }) as Promise<DefaultRoleInstallResult>,
    onSuccess: async (result) => {
      toast.success(
        `Default roles ready: ${result.created} created, ${result.updated} updated, ${result.skipped} unchanged.`,
      );
      await refresh("permissions");
      await refresh("roles");
      refetchAccount();
    },
    onError: (error) => {
      const message =
        error instanceof ApiError && error.status === 404
          ? "The default-roles API is unavailable. Restart the backend container (docker-compose restart backend) and try again."
          : error instanceof Error
            ? error.message
            : "Default roles could not be installed.";
      toast.error(message);
    },
  });

  const previewDefaultRoles = useMutation({
    mutationFn: () =>
      api<DefaultRolePreviewResult>(
        `/operator/clinics/${clinicId}/default-roles/?update_existing=${overwriteDefaultRoles ? "1" : "0"}`,
      ),
    onSuccess: (result) => {
      setDefaultRolePreview(result);
      setDefaultRolePreviewOpen(true);
    },
  });

  const createRole = useMutation({
    mutationFn: () =>
      api("/operator/roles/", {
        method: "POST",
        body: JSON.stringify({
          clinic: roleClinic,
          name: roleName,
          code: roleCode,
          permissions: rolePermissions,
        }),
      }),
    onSuccess: async () => {
      setRoleName("");
      setRoleCode("");
      setRolePermissions([]);
      setRoleError(null);
      toast.success("Role created.");
      await refresh("roles");
    },
    onError: setRoleError,
  });

  const updateRole = useMutation({
    mutationFn: (role: RoleRow) =>
      api(`/operator/roles/${role.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ name: editRoleName, permissions: editRolePermissions }),
      }),
    onSuccess: async () => {
      setEditRoleError(null);
      setEditingRole(null);
      toast.success("Role updated.");
      await refresh("roles");
    },
    onError: setEditRoleError,
  });

  const deleteRole = useMutation({
    mutationFn: (roleId: string) => api(`/operator/roles/${roleId}/`, { method: "DELETE" }),
    onSuccess: async (_data, roleId) => {
      setDeleteRoleId(null);
      setDeleteRoleError(null);
      if (editingRole?.id === roleId) {
        setEditingRole(null);
        setEditRoleName("");
        setEditRolePermissions([]);
      }
      toast.success("Role deleted.");
      await refresh("roles");
      await refresh("assignments");
    },
    onError: (error) => {
      const message =
        fieldMessages(error, "role")[0] ||
        (error instanceof Error ? error.message : "The role could not be deleted.");
      setDeleteRoleError(message);
      toast.error(message);
    },
  });

  const createUser = useMutation({
    mutationFn: () =>
      api("/operator/users/", {
        method: "POST",
        body: JSON.stringify({ clinic: userClinic, email, full_name: fullName, password }),
      }),
    onSuccess: async () => {
      setEmail("");
      setFullName("");
      setPassword("");
      setUserError(null);
      toast.success("Staff login created.");
      await refresh("users");
    },
    onError: setUserError,
  });

  const toggleUser = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api(`/operator/users/${id}/`, { method: "PATCH", body: JSON.stringify({ is_active }) }),
    onSuccess: async () => {
      toast.success("User updated.");
      await refresh("users");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "The user could not be updated.");
    },
  });

  const assign = useMutation({
    mutationFn: () =>
      api<{ role_code?: string; is_clinical_role?: boolean }>("/operator/assignments/", {
        method: "POST",
        body: JSON.stringify({
          user: assignUser,
          role: assignRole,
          branch: assignBranch || null,
        }),
      }),
    onSuccess: async (result) => {
      setAssignError(null);
      toast.success("Role assigned.");
      const assignedRole = roleRows.find((row) => row.id === assignRole);
      const roleCode = result.role_code ?? assignedRole?.code;
      const userEmail = userRows.find((row) => row.id === assignUser)?.email ?? "";
      if (roleCode && CLINICAL_ROLE_CODES.has(roleCode)) {
        setClinicalPromptEmail(userEmail);
        setClinicalPromptOpen(true);
      }
      await refresh("assignments");
    },
    onError: setAssignError,
  });

  const removeAssignment = useMutation({
    mutationFn: (assignmentId: string) =>
      api(`/operator/assignments/${assignmentId}/`, { method: "DELETE" }),
    onSuccess: async () => {
      setRemoveAssignmentId(null);
      toast.success("Assignment removed.");
      await refresh("assignments");
    },
  });

  function togglePermission(code: string) {
    setRolePermissions((current) =>
      current.includes(code) ? current.filter((item) => item !== code) : [...current, code],
    );
  }

  function toggleEditPermission(code: string) {
    setEditRolePermissions((current) =>
      current.includes(code) ? current.filter((item) => item !== code) : [...current, code],
    );
  }

  function openEditRole(role: RoleRow) {
    setEditingRole(role);
    setEditRoleName(role.name);
    setEditRolePermissions([...role.permissions]);
    setEditRoleError(null);
  }

  function openEditClinic(clinic: ClinicRow) {
    setEditingClinic(clinic);
    setEditClinicName(clinic.name);
    setEditClinicTimezone(clinic.timezone);
    setEditClinicCurrency(clinic.currency);
    setEditClinicActive(clinic.is_active);
    setEditClinicError(null);
  }

  if (clinics.isLoading) {
    return <QueryState status="loading" />;
  }

  const scopedBar = section !== "overview" ? <OperatorClinicBar /> : null;

  return (
    <>
      {section === "overview" ? (
        <OperatorOverview
          clinicCount={clinicRows.length}
          branchCount={branchRows.length}
          permissionCount={permissionRows.length}
          roleCount={roleRows.length}
          userCount={userRows.filter((row) => !row.is_superuser).length}
          assignmentCount={assignmentRows.length}
          clinicBranchCount={clinicSetup.data?.branch_count ?? branchRows.length}
          clinicRoleCount={clinicSetup.data?.role_count ?? roleRows.length}
          clinicUserCount={clinicSetup.data?.user_count ?? userRows.filter((row) => !row.is_superuser).length}
          clinicAssignmentCount={clinicSetup.data?.assignment_count ?? assignmentRows.length}
          clinicHasRoles={clinicSetup.data?.has_roles ?? roleRows.length > 0}
        />
      ) : null}

      {section === "clinics" ? (
      <>
      {scopedBar}
      <Card id="clinics" className="shadow-premium-sm">
        <CardHeader>
          <CardTitle>Clinics</CardTitle>
          <CardDescription>One clinic is the organization boundary.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Timezone</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-52">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clinicRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.code}</TableCell>
                    <TableCell>{row.timezone}</TableCell>
                    <TableCell>{row.currency}</TableCell>
                    <TableCell>
                      <ActiveBadge active={row.is_active} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => openEditClinic(row)}>
                          Edit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setDeleteClinicError(null);
                            setDeleteClinicId(row.id);
                          }}
                        >
                          Delete
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setClinicId(row.id);
                            setSetupWizardOpen(true);
                          }}
                        >
                          Set up
                        </Button>
                        <ToggleActiveButton
                          active={row.is_active}
                          label={row.name}
                          pending={toggleClinic.isPending}
                          onConfirm={() => toggleClinic.mutate({ id: row.id, is_active: !row.is_active })}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              createClinic.mutate();
            }}
          >
            <p className="text-sm font-medium md:col-span-2">Create clinic</p>
            <div className="space-y-2">
              <Label htmlFor="clinic-name">Name</Label>
              <Input id="clinic-name" value={clinicName} required onChange={(event) => setClinicName(event.target.value)} />
              <FieldError error={clinicError} name="name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clinic-code">Code</Label>
              <Input id="clinic-code" value={clinicCode} required onChange={(event) => setClinicCode(event.target.value)} />
              <FieldError error={clinicError} name="code" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clinic-timezone">Timezone</Label>
              <Input id="clinic-timezone" value={timezone} required onChange={(event) => setTimezone(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clinic-currency">Currency</Label>
              <Input id="clinic-currency" value={currency} required maxLength={3} onChange={(event) => setCurrency(event.target.value)} />
            </div>
            <div className="md:col-span-2">
              <FormNote error={clinicError} />
              <Button type="submit" disabled={createClinic.isPending}>
                Create clinic
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      </>
      ) : null}

      {section === "branches" ? (
      <>
      {scopedBar}
      <Card id="branches" className="shadow-premium-sm">
        <CardHeader>
          <CardTitle>Branches</CardTitle>
          <CardDescription>A branch is one site of the clinic. Leave a role unscoped to cover every branch.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branchRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.code}</TableCell>
                    <TableCell>
                      <ActiveBadge active={row.is_active} />
                    </TableCell>
                    <TableCell>
                      <ToggleActiveButton
                        active={row.is_active}
                        label={row.name}
                        pending={toggleBranch.isPending}
                        onConfirm={() => toggleBranch.mutate({ id: row.id, is_active: !row.is_active })}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <form
            className="grid gap-4 md:grid-cols-3"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              createBranch.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="branch-clinic">Clinic</Label>
              <Select value={branchClinic} onValueChange={setBranchClinic}>
                <SelectTrigger id="branch-clinic" className="w-full">
                  <SelectValue placeholder="Select a clinic" />
                </SelectTrigger>
                <SelectContent>
                  {clinicRows.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch-name">Name</Label>
              <Input id="branch-name" value={branchName} required onChange={(event) => setBranchName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch-code">Code</Label>
              <Input id="branch-code" value={branchCode} required onChange={(event) => setBranchCode(event.target.value)} />
              <FieldError error={branchError} name="code" />
            </div>
            <div className="md:col-span-3">
              <FormNote error={branchError} />
              <Button type="submit" disabled={createBranch.isPending || !branchClinic}>
                Create branch
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      </>
      ) : null}

      {section === "access" ? (
      <>
      {scopedBar}
      <Card id="access" className="shadow-premium-sm">
        <CardHeader>
          <CardTitle>Feature catalog & default roles</CardTitle>
          <CardDescription>
            The permission catalog is global. Default role templates are installed per clinic (automatically on clinic
            create). Use Custom roles for one-off bundles; clinic admins manage day-to-day assignments in their workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
            <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
              <div className="space-y-2">
                <p className="text-sm font-medium">Default roles for selected clinic</p>
                <p className="text-xs text-muted-foreground">
                  Includes Solo Practitioner, Receptionist, Doctor, and other templates.
                </p>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={overwriteDefaultRoles}
                    onChange={(event) => setOverwriteDefaultRoles(event.target.checked)}
                  />
                  Re-sync and overwrite existing default role permissions
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => installPermissions.mutate()}
                  disabled={installPermissions.isPending}
                  variant="outline"
                >
                  Install permissions
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => previewDefaultRoles.mutate()}
                  disabled={previewDefaultRoles.isPending || !clinicId}
                >
                  Preview changes
                </Button>
                <Button
                  type="button"
                  onClick={() => installDefaultRoles.mutate()}
                  disabled={installDefaultRoles.isPending || !clinicId}
                >
                  {overwriteDefaultRoles ? "Re-sync roles" : "Install default roles"}
                </Button>
              </div>
            </div>
          </div>
          {installPermissions.isError ? <FormNote error={installPermissions.error} /> : null}
          {installDefaultRoles.isError ? <FormNote error={installDefaultRoles.error} /> : null}
          {previewDefaultRoles.isError ? <FormNote error={previewDefaultRoles.error} /> : null}
          <ul className="grid gap-1 text-sm md:grid-cols-2">
            {permissionRows.map((row) => (
              <li key={row.code}>
                <span className="font-medium">{row.code}</span>
                <span className="text-muted-foreground"> · {row.description}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      </>
      ) : null}

      {section === "roles" ? (
      <>
      {scopedBar}
      <Card id="roles" className="shadow-premium-sm">
        <CardHeader>
          <CardTitle>Custom roles</CardTitle>
          <CardDescription>
            Optional clinic-specific permission bundles. Most clinics use default templates from Feature catalog.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Clinic</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead className="w-40">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roleRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.code}</TableCell>
                    <TableCell>{clinicRows.find((clinic) => clinic.id === row.clinic)?.name ?? row.clinic}</TableCell>
                    <TableCell className="max-w-md truncate" title={row.permissions.join(", ")}>
                      {row.permissions.join(", ") || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => openEditRole(row)}>
                          Edit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setDeleteRoleError(null);
                            setDeleteRoleId(row.id);
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <form
            className="space-y-4"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              createRole.mutate();
            }}
          >
            <p className="text-sm font-medium">Create role</p>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="role-clinic">Clinic</Label>
                <Select value={roleClinic} onValueChange={setRoleClinic}>
                  <SelectTrigger id="role-clinic" className="w-full">
                    <SelectValue placeholder="Select a clinic" />
                  </SelectTrigger>
                  <SelectContent>
                    {clinicRows.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="role-name">Name</Label>
                <Input id="role-name" value={roleName} required onChange={(event) => setRoleName(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role-code">Code</Label>
                <Input id="role-code" value={roleCode} required onChange={(event) => setRoleCode(event.target.value)} />
                <FieldError error={roleError} name="code" />
              </div>
            </div>
            <fieldset className="grid max-h-64 gap-2 overflow-auto rounded-md border p-3 md:grid-cols-2">
              <legend className="px-1 text-sm font-medium">Permissions</legend>
              {permissionRows.map((row) => (
                <label key={row.code} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={rolePermissions.includes(row.code)}
                    onChange={() => togglePermission(row.code)}
                  />
                  <span>{row.code}</span>
                </label>
              ))}
            </fieldset>
            <FieldError error={roleError} name="permissions" />
            <FormNote error={roleError} />
            <Button type="submit" disabled={createRole.isPending || !roleClinic}>
              Create role
            </Button>
          </form>
        </CardContent>
      </Card>
      </>
      ) : null}

      {section === "staff" ? (
      <>
      {scopedBar}
      <Card id="staff" className="shadow-premium-sm">
        <CardHeader>
          <CardTitle>Clinic logins</CardTitle>
          <CardDescription>
            User accounts for clinic staff (not platform operators). Assign roles on the Role assignments tab or use the
            setup wizard to do both at once.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {userRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.full_name}</TableCell>
                    <TableCell>{row.email}</TableCell>
                    <TableCell>{row.is_superuser ? <StatusText value="operator" /> : "Staff"}</TableCell>
                    <TableCell>
                      <ActiveBadge active={row.is_active} />
                    </TableCell>
                    <TableCell>
                      {row.is_superuser ? (
                        <span className="text-xs text-muted-foreground">Protected</span>
                      ) : (
                        <ToggleActiveButton
                          active={row.is_active}
                          label={row.full_name}
                          pending={toggleUser.isPending}
                          onConfirm={() => toggleUser.mutate({ id: row.id, is_active: !row.is_active })}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              createUser.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="user-clinic">Clinic</Label>
              <Select value={userClinic} onValueChange={setUserClinic}>
                <SelectTrigger id="user-clinic" className="w-full">
                  <SelectValue placeholder="Select a clinic" />
                </SelectTrigger>
                <SelectContent>
                  {clinicRows.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-name">Full name</Label>
              <Input id="user-name" value={fullName} required onChange={(event) => setFullName(event.target.value)} />
              <FieldError error={userError} name="full_name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-email">Email</Label>
              <Input id="user-email" type="email" autoComplete="off" value={email} required onChange={(event) => setEmail(event.target.value)} />
              <FieldError error={userError} name="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-password">Password</Label>
              <PasswordInput id="user-password" autoComplete="new-password" value={password} required onChange={(event) => setPassword(event.target.value)} />
              <FieldError error={userError} name="password" />
            </div>
            <div className="md:col-span-2">
              <FormNote error={userError} />
              <Button type="submit" disabled={createUser.isPending || !userClinic}>
                Create staff login
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      </>
      ) : null}

      {section === "assignments" ? (
      <>
      {scopedBar}
      <Card id="assignments" className="shadow-premium-sm">
        <CardHeader>
          <CardTitle>Role assignments</CardTitle>
          <CardDescription>
            Grants permissions by linking a login to a role. Leave branch empty for all branches. Clinical roles also
            need a Staff record in the clinic workspace for scheduling.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead className="w-28">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignmentRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.user_email}</TableCell>
                    <TableCell>{row.role_name}</TableCell>
                    <TableCell>{row.branch_name ?? "All branches"}</TableCell>
                    <TableCell>
                      <Button type="button" size="sm" variant="outline" onClick={() => setRemoveAssignmentId(row.id)}>
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <form
            className="grid gap-4 md:grid-cols-3"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              assign.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="assign-user">User</Label>
              <Select value={assignUser} onValueChange={setAssignUser}>
                <SelectTrigger id="assign-user" className="w-full">
                  <SelectValue placeholder="Select a user" />
                </SelectTrigger>
                <SelectContent>
                  {userRows.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="assign-role">Role</Label>
              <Select value={assignRole} onValueChange={setAssignRole}>
                <SelectTrigger id="assign-role" className="w-full">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {roleRows.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError error={assignError} name="role" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="assign-branch">Branch</Label>
              <Select value={assignBranch || "__all__"} onValueChange={(value) => setAssignBranch(value === "__all__" ? "" : value)}>
                <SelectTrigger id="assign-branch" className="w-full">
                  <SelectValue placeholder="All branches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All branches</SelectItem>
                  {branchRows.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-3">
              <FormNote error={assignError} />
              <Button type="submit" disabled={assign.isPending || !assignUser || !assignRole}>
                Assign role
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      </>
      ) : null}

      <ClinicSetupWizard open={setupWizardOpen} onOpenChange={setSetupWizardOpen} />

      <Dialog open={clinicalPromptOpen} onOpenChange={setClinicalPromptOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Staff record?</DialogTitle>
            <DialogDescription>
              {clinicalPromptEmail
                ? `${clinicalPromptEmail} has a clinical role. For appointments and queue visibility, add a matching Staff record in the clinic workspace under Settings → Staff.`
                : "Clinical roles also need a Staff record in the clinic workspace for scheduling."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setClinicalPromptOpen(false)}>
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(removeAssignmentId)}
        onOpenChange={(open) => {
          if (!open) {
            setRemoveAssignmentId(null);
          }
        }}
        title="Remove this assignment?"
        description="The user will lose permissions from this role until it is assigned again."
        confirmLabel="Remove assignment"
        destructive
        pending={removeAssignment.isPending}
        onConfirm={() => {
          if (removeAssignmentId) {
            removeAssignment.mutate(removeAssignmentId);
          }
        }}
      />

      <Dialog
        open={Boolean(editingClinic)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingClinic(null);
            setEditClinicError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit clinic</DialogTitle>
            <DialogDescription>
              {editingClinic ? `${editingClinic.name} (${editingClinic.code})` : "Update clinic settings."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              if (editingClinic) {
                updateClinic.mutate(editingClinic);
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="edit-clinic-name">Name</Label>
              <Input
                id="edit-clinic-name"
                value={editClinicName}
                required
                onChange={(event) => setEditClinicName(event.target.value)}
              />
              <FieldError error={editClinicError} name="name" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-clinic-timezone">Timezone</Label>
                <Input
                  id="edit-clinic-timezone"
                  value={editClinicTimezone}
                  required
                  onChange={(event) => setEditClinicTimezone(event.target.value)}
                />
                <FieldError error={editClinicError} name="timezone" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-clinic-currency">Currency</Label>
                <Input
                  id="edit-clinic-currency"
                  value={editClinicCurrency}
                  required
                  maxLength={3}
                  onChange={(event) => setEditClinicCurrency(event.target.value)}
                />
                <FieldError error={editClinicError} name="currency" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editClinicActive}
                onChange={(event) => setEditClinicActive(event.target.checked)}
              />
              Active
            </label>
            <FormNote error={editClinicError} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingClinic(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateClinic.isPending || !editingClinic}>
                {updateClinic.isPending ? "Saving…" : "Save clinic"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteClinicId)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteClinicId(null);
            setDeleteClinicError(null);
          }
        }}
        title="Delete this clinic?"
        description={
          deleteClinicError ||
          "Remove branches, roles, staff users, and patient records first. This cannot be undone."
        }
        confirmLabel="Delete clinic"
        destructive
        pending={deleteClinic.isPending}
        onConfirm={() => {
          if (deleteClinicId) {
            deleteClinic.mutate(deleteClinicId);
          }
        }}
      />

      <Dialog
        open={Boolean(editingRole)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingRole(null);
            setEditRoleError(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit role</DialogTitle>
            <DialogDescription>
              {editingRole ? `${editingRole.name} (${editingRole.code})` : "Update the role name and permissions."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              if (editingRole) {
                updateRole.mutate(editingRole);
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="edit-role-name">Name</Label>
              <Input
                id="edit-role-name"
                value={editRoleName}
                required
                onChange={(event) => setEditRoleName(event.target.value)}
              />
            </div>
            <fieldset className="grid max-h-64 gap-2 overflow-auto rounded-md border p-3 md:grid-cols-2">
              <legend className="px-1 text-sm font-medium">Permissions</legend>
              {permissionRows.map((row) => (
                <label key={row.code} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={editRolePermissions.includes(row.code)}
                    onChange={() => toggleEditPermission(row.code)}
                  />
                  <span>{row.code}</span>
                </label>
              ))}
            </fieldset>
            <FieldError error={editRoleError} name="permissions" />
            <FieldError error={editRoleError} name="name" />
            <FormNote error={editRoleError} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingRole(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateRole.isPending || !editingRole}>
                {updateRole.isPending ? "Saving…" : "Save role"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteRoleId)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteRoleId(null);
            setDeleteRoleError(null);
          }
        }}
        title="Delete this role?"
        description={
          deleteRoleError ||
          "Remove any role assignments first. This cannot be undone."
        }
        confirmLabel="Delete role"
        destructive
        pending={deleteRole.isPending}
        onConfirm={() => {
          if (deleteRoleId) {
            deleteRole.mutate(deleteRoleId);
          }
        }}
      />

      <Dialog open={defaultRolePreviewOpen} onOpenChange={setDefaultRolePreviewOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Default role preview</DialogTitle>
            <DialogDescription>
              {defaultRolePreview?.update_existing
                ? "This preview shows what will change during re-sync."
                : "This preview shows what will be created and what existing roles will be kept."}
            </DialogDescription>
          </DialogHeader>
          {defaultRolePreview ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {defaultRolePreview.created} create · {defaultRolePreview.updated} update · {defaultRolePreview.skipped}{" "}
                skip · {defaultRolePreview.unchanged} unchanged
              </p>
              {defaultRolePreview.missing_permission_codes.length > 0 ? (
                <p className="rounded-md border border-muted bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  Missing permission codes in catalog: {defaultRolePreview.missing_permission_codes.join(", ")}
                </p>
              ) : null}
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Added permissions</TableHead>
                      <TableHead>Removed permissions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {defaultRolePreview.items.map((item) => (
                      <TableRow key={item.code}>
                        <TableCell>
                          <div className="text-sm font-medium">{item.name}</div>
                          <div className="text-xs text-muted-foreground">{item.code}</div>
                          {item.existing_name && item.existing_name !== item.name ? (
                            <div className="text-xs text-muted-foreground">Current name: {item.existing_name}</div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <StatusText value={item.status} />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {item.added_permissions.length ? item.added_permissions.join(", ") : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {item.removed_permissions.length ? item.removed_permissions.join(", ") : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDefaultRolePreviewOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
