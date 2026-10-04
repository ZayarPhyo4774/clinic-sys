"use client";

import { Shield, UserCog, Users } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { FormError, FormFieldError } from "@/components/form-field-error";
import { PageHeader } from "@/components/page-header";
import { QueryState, describeError } from "@/components/query-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useResourceList } from "@/hooks/use-resource-list";
import { RequirePermission } from "@/features/access/require-permission";
import { api, withQuery } from "@/lib/api/client";
import type { Branch } from "@/lib/api/types";
import {
  adminAssignmentSchema,
  adminRoleCreateSchema,
  adminRoleUpdateSchema,
  validateForm,
} from "@/lib/forms/schemas";
import { cn } from "@/lib/utils";
import { isOnline } from "@/offline/connectivity/network";
import { requireOnlineMutation } from "@/offline/sync/policy";

type PermissionRow = { code: string; description: string };
type RoleRow = { id: string; name: string; code: string; permissions: string[] };
type UserRow = { id: string; email: string; full_name: string };
type AssignmentRow = {
  id: string;
  user_email: string;
  role_name: string;
  branch_name: string | null;
};

type ListResponse<T> = { results: T[] };

const NO_BRANCH = "__none__";
const HIGHLIGHT_ROLE_CODES = new Set(["solo-practitioner", "receptionist", "clinic-admin"]);

function groupPermissions(permissions: PermissionRow[]) {
  const groups = new Map<string, PermissionRow[]>();
  for (const permission of permissions) {
    const module = permission.code.split(".")[0] ?? "other";
    const bucket = groups.get(module) ?? [];
    bucket.push(permission);
    groups.set(module, bucket);
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function PermissionPicker({
  permissions,
  selected,
  onToggle,
  disabled = false,
  search,
  onSearchChange,
}: {
  permissions: PermissionRow[];
  selected: string[];
  onToggle: (code: string) => void;
  disabled?: boolean;
  search: string;
  onSearchChange: (value: string) => void;
}) {
  const needle = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!needle) {
      return permissions;
    }
    return permissions.filter(
      (row) =>
        row.code.toLowerCase().includes(needle) || row.description.toLowerCase().includes(needle),
    );
  }, [needle, permissions]);
  const groups = groupPermissions(filtered);

  return (
    <div className="space-y-3">
      <Input
        placeholder="Search permissions…"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        disabled={disabled}
      />
      <div className="max-h-72 space-y-4 overflow-y-auto rounded-xl border bg-muted/20 p-3">
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No permissions match your search.</p>
        ) : (
          groups.map(([module, rows]) => (
            <div key={module}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{module}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {rows.map((permission) => (
                  <label
                    key={permission.code}
                    className={cn(
                      "flex cursor-pointer items-start gap-2 rounded-lg border bg-card p-2.5 text-sm transition-colors",
                      selected.includes(permission.code) && "border-primary/40 bg-primary/5",
                      disabled && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(permission.code)}
                      disabled={disabled}
                      onChange={() => onToggle(permission.code)}
                      className="mt-1"
                    />
                    <span>
                      <span className="font-medium">{permission.code}</span>
                      <span className="mt-0.5 block text-muted-foreground">{permission.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
      <p className="text-xs text-muted-foreground">{selected.length} selected</p>
    </div>
  );
}

export function RolesScreen() {
  return (
    <RequirePermission permission="roles.manage" title="Roles">
      <RolesAdmin />
    </RequirePermission>
  );
}

function RolesAdmin() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("assignments");
  const [permissionSearch, setPermissionSearch] = useState("");
  const [editPermissionSearch, setEditPermissionSearch] = useState("");

  const permissions = useQuery({
    queryKey: ["admin", "permissions"],
    queryFn: () => api<ListResponse<PermissionRow>>("/admin/permissions/"),
  });
  const roles = useQuery({
    queryKey: ["admin", "roles"],
    queryFn: () => api<ListResponse<RoleRow>>("/admin/roles/"),
  });
  const users = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => api<ListResponse<UserRow>>("/admin/users/"),
  });
  const assignments = useQuery({
    queryKey: ["admin", "assignments"],
    queryFn: () => api<ListResponse<AssignmentRow>>("/admin/assignments/"),
  });
  const branches = useResourceList<Branch>("branches", withQuery("/branches/", { page_size: "100" }));

  const [roleName, setRoleName] = useState("");
  const [roleCode, setRoleCode] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [roleError, setRoleError] = useState<unknown>(null);

  const [assignUser, setAssignUser] = useState("");
  const [assignRole, setAssignRole] = useState("");
  const [assignBranch, setAssignBranch] = useState("");
  const [assignError, setAssignError] = useState<unknown>(null);

  const [editRoleId, setEditRoleId] = useState("");
  const [editRoleName, setEditRoleName] = useState("");
  const [editPermissions, setEditPermissions] = useState<string[]>([]);
  const [editError, setEditError] = useState<unknown>(null);

  const roleRows = roles.data?.results ?? [];
  const assignmentRows = assignments.data?.results ?? [];
  const permissionRows = permissions.data?.results ?? [];

  const createRole = useMutation({
    mutationFn: () => {
      requireOnlineMutation("admin.roles.create", isOnline());
      return api<RoleRow>("/admin/roles/", {
        method: "POST",
        body: JSON.stringify({ name: roleName, code: roleCode, permissions: selectedPermissions }),
      });
    },
    onSuccess: async () => {
      setRoleName("");
      setRoleCode("");
      setSelectedPermissions([]);
      setPermissionSearch("");
      setRoleError(null);
      toast.success("Role created.");
      await queryClient.invalidateQueries({ queryKey: ["admin", "roles"] });
      setTab("roles");
    },
    onError: (caught) => setRoleError(caught),
  });

  const updateRole = useMutation({
    mutationFn: () => {
      requireOnlineMutation("admin.roles.update", isOnline());
      return api<RoleRow>(`/admin/roles/${editRoleId}/`, {
        method: "PATCH",
        body: JSON.stringify({ name: editRoleName, permissions: editPermissions }),
      });
    },
    onSuccess: async () => {
      setEditError(null);
      toast.success("Role updated.");
      await queryClient.invalidateQueries({ queryKey: ["admin", "roles"] });
    },
    onError: (caught) => setEditError(caught),
  });

  const createAssignment = useMutation({
    mutationFn: () => {
      requireOnlineMutation("admin.assignments.create", isOnline());
      return api("/admin/assignments/", {
        method: "POST",
        body: JSON.stringify({
          user: assignUser,
          role: assignRole,
          branch: assignBranch && assignBranch !== NO_BRANCH ? assignBranch : undefined,
        }),
      });
    },
    onSuccess: async () => {
      setAssignUser("");
      setAssignRole("");
      setAssignBranch("");
      setAssignError(null);
      toast.success("Role assigned.");
      await queryClient.invalidateQueries({ queryKey: ["admin", "assignments"] });
    },
    onError: (caught) => setAssignError(caught),
  });

  function onCreateRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRoleError(null);
    if (
      !validateForm(
        adminRoleCreateSchema,
        { name: roleName, code: roleCode, permissions: selectedPermissions },
        setRoleError,
      )
    ) {
      return;
    }
    createRole.mutate();
  }

  function onAssignRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAssignError(null);
    if (
      !validateForm(
        adminAssignmentSchema,
        { user: assignUser, role: assignRole, branch: assignBranch || NO_BRANCH },
        setAssignError,
      )
    ) {
      return;
    }
    createAssignment.mutate();
  }

  function togglePermission(code: string) {
    setSelectedPermissions((current) =>
      current.includes(code) ? current.filter((item) => item !== code) : [...current, code],
    );
  }

  function toggleEditPermission(code: string) {
    setEditPermissions((current) =>
      current.includes(code) ? current.filter((item) => item !== code) : [...current, code],
    );
  }

  useEffect(() => {
    const role = roleRows.find((row) => row.id === editRoleId);
    if (!role) {
      setEditRoleName("");
      setEditPermissions([]);
      return;
    }
    setEditRoleName(role.name);
    setEditPermissions(role.permissions);
  }, [editRoleId, roleRows]);

  function onEditRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEditError(null);
    if (
      !validateForm(
        adminRoleUpdateSchema,
        { roleId: editRoleId, name: editRoleName, permissions: editPermissions },
        setEditError,
      )
    ) {
      return;
    }
    updateRole.mutate();
  }

  function startEditRole(roleId: string) {
    setEditRoleId(roleId);
    setEditPermissionSearch("");
    setTab("manage");
  }

  function quickAssignRole(roleId: string) {
    setAssignRole(roleId);
    setTab("assignments");
  }

  const soloRole = roleRows.find((row) => row.code === "solo-practitioner");

  return (
    <section className="space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Roles & access"
        description="Assign roles like Solo Practitioner to staff, or customize permission bundles for your clinic."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="shadow-premium-sm">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-xl bg-primary/10 p-3 text-primary">
              <Shield className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">{roleRows.length}</p>
              <p className="text-sm text-muted-foreground">Roles defined</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-premium-sm">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-xl bg-primary/10 p-3 text-primary">
              <UserCog className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">{assignmentRows.length}</p>
              <p className="text-sm text-muted-foreground">Active assignments</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-premium-sm">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-xl bg-primary/10 p-3 text-primary">
              <Users className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">{users.data?.results.length ?? "—"}</p>
              <p className="text-sm text-muted-foreground">Clinic users</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {soloRole ? (
        <Card className="border-primary/20 bg-primary/5 shadow-premium-sm">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">Solo clinic setup</p>
              <p className="text-sm text-muted-foreground">
                Assign <span className="font-medium text-foreground">{soloRole.name}</span> to your doctor&apos;s login
                for register → consult → dispense → bill in one account.
              </p>
            </div>
            <Button type="button" variant="outline" onClick={() => quickAssignRole(soloRole.id)}>
              Assign Solo Practitioner
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="manage">Create & edit</TabsTrigger>
        </TabsList>

        <TabsContent value="assignments" className="mt-6 space-y-6">
          <Card className="shadow-premium-sm">
            <CardHeader>
              <CardTitle>Assign role</CardTitle>
              <CardDescription>
                Pick a user and role. Branch-scoped assignments apply only when that branch is selected in the header.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-4 md:grid-cols-3" onSubmit={onAssignRole}>
                <div className="space-y-2">
                  <Label htmlFor="assign_user">User</Label>
                  <Select value={assignUser || undefined} onValueChange={setAssignUser}>
                    <SelectTrigger id="assign_user" className="w-full">
                      <SelectValue placeholder="Select user" />
                    </SelectTrigger>
                    <SelectContent position="popper" className="z-[100]">
                      {users.data?.results.map((row) => (
                        <SelectItem key={row.id} value={row.id}>
                          {row.full_name} ({row.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormFieldError error={assignError} name="user" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="assign_role">Role</Label>
                  <Select value={assignRole || undefined} onValueChange={setAssignRole}>
                    <SelectTrigger id="assign_role" className="w-full">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent position="popper" className="z-[100]">
                      {roleRows.map((row) => (
                        <SelectItem key={row.id} value={row.id}>
                          {row.name}
                          {HIGHLIGHT_ROLE_CODES.has(row.code) ? " ★" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormFieldError error={assignError} name="role" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="assign_branch">Branch</Label>
                  <Select
                    value={assignBranch || NO_BRANCH}
                    onValueChange={setAssignBranch}
                  >
                    <SelectTrigger id="assign_branch" className="w-full">
                      <SelectValue placeholder="All branches" />
                    </SelectTrigger>
                    <SelectContent position="popper" className="z-[100]">
                      <SelectItem value={NO_BRANCH}>All branches</SelectItem>
                      {branches.data?.map((branch) => (
                        <SelectItem key={branch.id} value={branch.id}>
                          {branch.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormFieldError error={assignError} name="branch" />
                </div>
                <div className="md:col-span-3">
                  <Button type="submit" disabled={createAssignment.isPending}>
                    {createAssignment.isPending ? "Assigning…" : "Assign role"}
                  </Button>
                </div>
                <div className="md:col-span-3">
                  <FormError error={assignError} />
                </div>
              </form>
            </CardContent>
          </Card>

          {assignments.isError ? (
            <QueryState
              status="error"
              detail={describeError(assignments.error)}
              onRetry={() => void assignments.refetch()}
            />
          ) : null}
          {assignments.isLoading ? <QueryState status="loading" /> : null}
          {assignments.data ? (
            <Card className="shadow-premium-sm">
              <CardHeader>
                <CardTitle className="text-base">Current assignments</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-hidden rounded-b-xl border-t">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Branch</TableHead>
                        <TableHead className="w-28" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {assignmentRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                            No role assignments yet. Assign Solo Practitioner to your doctor above.
                          </TableCell>
                        </TableRow>
                      ) : (
                        assignmentRows.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell>{row.user_email}</TableCell>
                            <TableCell>{row.role_name}</TableCell>
                            <TableCell>{row.branch_name || "All branches"}</TableCell>
                            <TableCell>
                              <RemoveAssignmentButton assignmentId={row.id} />
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent value="roles" className="mt-6 space-y-6">
          {roles.isLoading ? <QueryState status="loading" /> : null}
          {roles.isError ? (
            <QueryState status="error" detail={describeError(roles.error)} onRetry={() => void roles.refetch()} />
          ) : null}
          {roles.data ? (
            <Card className="shadow-premium-sm">
              <CardHeader>
                <CardTitle className="text-base">Role catalog</CardTitle>
                <CardDescription>
                  Default roles are installed from the operator console. Custom roles can be created under Create & edit.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-hidden rounded-b-xl border-t">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Role</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Permissions</TableHead>
                        <TableHead className="w-36" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {roleRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                            No roles yet. Install default roles from the operator console, or create one under Create &
                            edit.
                          </TableCell>
                        </TableRow>
                      ) : (
                        roleRows.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium">{row.name}</span>
                                {HIGHLIGHT_ROLE_CODES.has(row.code) ? (
                                  <Badge variant="info">Recommended</Badge>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell>
                              <code className="text-xs text-muted-foreground">{row.code}</code>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{row.permissions.length} permissions</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                <Button type="button" size="sm" variant="outline" onClick={() => startEditRole(row.id)}>
                                  Edit
                                </Button>
                                <Button type="button" size="sm" onClick={() => quickAssignRole(row.id)}>
                                  Assign
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent value="manage" className="mt-6 space-y-6">
          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="shadow-premium-sm">
              <CardHeader>
                <CardTitle>Create role</CardTitle>
                <CardDescription>Permissions come from the clinic catalog installed by your operator.</CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={onCreateRole}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="role_name">Name</Label>
                      <Input
                        id="role_name"
                        required
                        value={roleName}
                        onChange={(event) => setRoleName(event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="role_code">Code</Label>
                      <Input
                        id="role_code"
                        required
                        value={roleCode}
                        onChange={(event) => setRoleCode(event.target.value)}
                      />
                      <FormFieldError error={roleError} name="code" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Permissions</Label>
                    {permissions.isLoading ? <QueryState status="loading" /> : null}
                    {permissions.data ? (
                      <PermissionPicker
                        permissions={permissionRows}
                        selected={selectedPermissions}
                        onToggle={togglePermission}
                        search={permissionSearch}
                        onSearchChange={setPermissionSearch}
                      />
                    ) : null}
                    <FormFieldError error={roleError} name="permissions" />
                  </div>
                  <Button type="submit" disabled={createRole.isPending}>
                    {createRole.isPending ? "Creating…" : "Create role"}
                  </Button>
                  <FormError error={roleError} />
                </form>
              </CardContent>
            </Card>

            <Card className="shadow-premium-sm">
              <CardHeader>
                <CardTitle>Edit role</CardTitle>
                <CardDescription>Update a role name or change its permission set.</CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={onEditRole}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="edit_role">Role</Label>
                      <Select value={editRoleId || undefined} onValueChange={setEditRoleId}>
                        <SelectTrigger id="edit_role" className="w-full">
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent position="popper" className="z-[100]">
                          {roleRows.map((row) => (
                            <SelectItem key={row.id} value={row.id}>
                              {row.name} ({row.code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit_role_name">Name</Label>
                      <Input
                        id="edit_role_name"
                        value={editRoleName}
                        required
                        disabled={!editRoleId}
                        onChange={(event) => setEditRoleName(event.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Permissions</Label>
                    {permissions.data ? (
                      <PermissionPicker
                        permissions={permissionRows}
                        selected={editPermissions}
                        onToggle={toggleEditPermission}
                        disabled={!editRoleId}
                        search={editPermissionSearch}
                        onSearchChange={setEditPermissionSearch}
                      />
                    ) : null}
                    <FormFieldError error={editError} name="permissions" />
                  </div>
                  <Button type="submit" disabled={updateRole.isPending || !editRoleId}>
                    {updateRole.isPending ? "Saving…" : "Save role"}
                  </Button>
                  <FormError error={editError} />
                </form>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}

function RemoveAssignmentButton({ assignmentId }: { assignmentId: string }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("admin.assignments.remove", isOnline());
      return api(`/admin/assignments/${assignmentId}/`, { method: "DELETE" });
    },
    onSuccess: async () => {
      toast.success("Assignment removed.");
      await queryClient.invalidateQueries({ queryKey: ["admin", "assignments"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "The removal was rejected.");
    },
  });

  return (
    <Button type="button" size="sm" variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
      {mutation.isPending ? "Removing…" : "Remove"}
    </Button>
  );
}
