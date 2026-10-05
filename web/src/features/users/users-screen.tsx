"use client";

import { UserCheck, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { FormError, FormFieldError } from "@/components/form-field-error";
import { PageHeader } from "@/components/page-header";
import { QueryState, describeError } from "@/components/query-state";
import { StatusText } from "@/components/record-browser";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RequirePermission } from "@/features/access/require-permission";
import { api } from "@/lib/api/client";
import { adminUserCreateSchema, adminUserNameSchema, validateForm } from "@/lib/forms/schemas";
import { isOnline } from "@/offline/connectivity/network";
import { requireOnlineMutation } from "@/offline/sync/policy";

type ClinicUser = {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
};

type ListResponse<T> = { results: T[] };

export function UsersScreen() {
  return (
    <RequirePermission permission="users.manage" title="Users">
      <UsersAdmin />
    </RequirePermission>
  );
}

function UsersAdmin() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("directory");
  const [search, setSearch] = useState("");

  const users = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => api<ListResponse<ClinicUser>>("/admin/users/"),
  });

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);

  const userRows = users.data?.results ?? [];
  const activeCount = userRows.filter((row) => row.is_active).length;
  const inactiveCount = userRows.length - activeCount;

  const filteredUsers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) {
      return userRows;
    }
    return userRows.filter(
      (row) => row.full_name.toLowerCase().includes(needle) || row.email.toLowerCase().includes(needle),
    );
  }, [search, userRows]);

  const createUser = useMutation({
    mutationFn: () => {
      requireOnlineMutation("admin.users.create", isOnline());
      return api<ClinicUser>("/admin/users/", {
        method: "POST",
        body: JSON.stringify({ email, full_name: fullName, password }),
      });
    },
    onSuccess: async () => {
      setEmail("");
      setFullName("");
      setPassword("");
      setError(null);
      toast.success("User created. Assign a role on the Roles page.");
      await queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      setTab("directory");
    },
    onError: (caught) => setError(caught),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!validateForm(adminUserCreateSchema, { email, full_name: fullName, password }, setError)) {
      return;
    }
    createUser.mutate();
  }

  return (
    <section className="space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Users"
        description="Clinic staff logins for your organization. Create accounts here, then assign roles on the Roles page."
        action={
          <Button asChild variant="outline">
            <Link href="/roles">Go to Roles</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="shadow-premium-sm">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-xl bg-primary/10 p-3 text-primary">
              <Users className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">{userRows.length}</p>
              <p className="text-sm text-muted-foreground">Total users</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-premium-sm">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-xl bg-primary/10 p-3 text-primary">
              <UserCheck className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">{activeCount}</p>
              <p className="text-sm text-muted-foreground">Active</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-premium-sm">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-xl bg-muted p-3 text-muted-foreground">
              <UserPlus className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">{inactiveCount}</p>
              <p className="text-sm text-muted-foreground">Inactive</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-primary/20 bg-primary/5 shadow-premium-sm">
        <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">People & permissions</p>
            <p className="text-sm text-muted-foreground">
              Create logins here, then assign roles on the Roles page. Clinical roles (e.g. Solo Practitioner) also need a
              Staff record under Settings → Staff for scheduling.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setTab("create")}>
              Create user
            </Button>
            <Button asChild>
              <Link href="/roles">Assign role</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="directory">Directory</TabsTrigger>
          <TabsTrigger value="create">Create user</TabsTrigger>
          <TabsTrigger value="manage">Manage</TabsTrigger>
        </TabsList>

        <TabsContent value="directory" className="mt-6 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Input
              placeholder="Search by name or email…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="max-w-md"
            />
            <p className="text-sm text-muted-foreground">
              {filteredUsers.length} of {userRows.length} shown
            </p>
          </div>

          {users.isLoading ? <QueryState status="loading" /> : null}
          {users.isError ? (
            <QueryState status="error" detail={describeError(users.error)} onRetry={() => void users.refetch()} />
          ) : null}
          {users.data ? (
            <Card className="shadow-premium-sm">
              <CardContent className="p-0">
                <div className="overflow-hidden rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-32" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                            {userRows.length === 0
                              ? "No users yet. Create the first staff login under Create user."
                              : "No users match your search."}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredUsers.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell className="font-medium">{row.full_name}</TableCell>
                            <TableCell>{row.email}</TableCell>
                            <TableCell>
                              <StatusText value={row.is_active ? "active" : "inactive"} />
                            </TableCell>
                            <TableCell>
                              <UserActiveToggle user={row} />
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

        <TabsContent value="create" className="mt-6">
          <Card className="mx-auto max-w-2xl shadow-premium-sm">
            <CardHeader>
              <CardTitle>Create user</CardTitle>
              <CardDescription>
                New users belong to your clinic. After creating an account, assign a role on the{" "}
                <Link href="/roles" className="font-medium text-primary hover:underline">
                  Roles
                </Link>{" "}
                page.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={onSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="user_email">Email</Label>
                  <Input
                    id="user_email"
                    type="email"
                    required
                    autoComplete="off"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                  <FormFieldError error={error} name="email" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="user_full_name">Full name</Label>
                  <Input
                    id="user_full_name"
                    required
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                  />
                  <FormFieldError error={error} name="full_name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="user_password">Password</Label>
                  <PasswordInput
                    id="user_password"
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <FormFieldError error={error} name="password" />
                </div>
                <Button type="submit" disabled={createUser.isPending}>
                  {createUser.isPending ? "Creating…" : "Create user"}
                </Button>
                <FormError error={error} />
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="manage" className="mt-6">
          <Card className="mx-auto max-w-2xl shadow-premium-sm">
            <CardHeader>
              <CardTitle>Update display name</CardTitle>
              <CardDescription>Change how a staff member&apos;s name appears across the clinic app.</CardDescription>
            </CardHeader>
            <CardContent>
              {users.data ? <EditUserNameForm users={userRows} /> : <QueryState status="loading" />}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </section>
  );
}

function EditUserNameForm({ users }: { users: ClinicUser[] }) {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("admin.users.update_name", isOnline());
      return api<ClinicUser>(`/admin/users/${userId}/`, {
        method: "PATCH",
        body: JSON.stringify({ full_name: fullName }),
      });
    },
    onSuccess: async () => {
      setError(null);
      toast.success("User updated.");
      await queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (caught) => setError(caught),
  });

  useEffect(() => {
    const user = users.find((row) => row.id === userId);
    setFullName(user?.full_name ?? "");
  }, [userId, users]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!validateForm(adminUserNameSchema, { userId, full_name: fullName }, setError)) {
      return;
    }
    mutation.mutate();
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="space-y-2">
        <Label htmlFor="edit_user">User</Label>
        <Select value={userId || undefined} onValueChange={setUserId}>
          <SelectTrigger id="edit_user" className="w-full">
            <SelectValue placeholder="Select user" />
          </SelectTrigger>
          <SelectContent position="popper" className="z-[100]">
            {users.map((row) => (
              <SelectItem key={row.id} value={row.id}>
                {row.full_name} ({row.email})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit_full_name">Full name</Label>
        <Input
          id="edit_full_name"
          required
          disabled={!userId}
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
        />
        <FormFieldError error={error} name="full_name" />
      </div>
      <Button type="submit" disabled={mutation.isPending || !userId}>
        {mutation.isPending ? "Saving…" : "Save name"}
      </Button>
      <FormError error={error} />
    </form>
  );
}

function UserActiveToggle({ user }: { user: ClinicUser }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("admin.users.toggle_active", isOnline());
      return api<ClinicUser>(`/admin/users/${user.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !user.is_active }),
      });
    },
    onSuccess: async () => {
      toast.success(`User ${user.is_active ? "deactivated" : "activated"}.`);
      await queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "The update was rejected.");
    },
  });

  return (
    <Button type="button" size="sm" variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
      {mutation.isPending ? "Saving…" : user.is_active ? "Deactivate" : "Activate"}
    </Button>
  );
}
