"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

import { BranchSelect } from "@/components/entity-picker";
import { FormError, FormFieldError } from "@/components/form-field-error";
import { RecordBrowser, StatusText } from "@/components/record-browser";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { allowed } from "@/features/access/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import { RequirePermission } from "@/features/access/require-permission";
import { ToggleActiveButton } from "@/features/organization/org-writes";
import { api } from "@/lib/api/client";
import type { Department } from "@/lib/api/types";
import { departmentCreateSchema, validateForm } from "@/lib/forms/schemas";
import { isOnline } from "@/offline/connectivity/network";
import { requireOnlineMutation } from "@/offline/sync/policy";

function CreateDepartmentForm() {
  const { account } = useAuth();
  const queryClient = useQueryClient();
  const [branch, setBranch] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("departments.create", isOnline());
      return api<Department>("/departments/", {
        method: "POST",
        body: JSON.stringify({ branch, name, code }),
      });
    },
    onSuccess: async () => {
      setBranch("");
      setName("");
      setCode("");
      setError(null);
      toast.success("Department created.");
      await queryClient.invalidateQueries({ queryKey: ["departments"] });
    },
    onError: (caught) => setError(caught),
  });

  if (!account || !allowed(account.permissions, "departments.manage")) {
    return null;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!validateForm(departmentCreateSchema, { branch, name, code }, setError)) {
      return;
    }
    mutation.mutate();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add department</CardTitle>
        <CardDescription>Organize staff within a branch.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
          <BranchSelect id="dept_branch" value={branch} onValueChange={setBranch} />
          <div className="space-y-2">
            <Label htmlFor="dept_name">Name</Label>
            <Input id="dept_name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dept_code">Code</Label>
            <Input id="dept_code" value={code} onChange={(event) => setCode(event.target.value)} />
            <FormFieldError error={error} name="code" />
          </div>
          <div className="md:col-span-2">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Create department"}
            </Button>
          </div>
          <div className="md:col-span-2">
            <FormError error={error} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function DepartmentsScreen() {
  const { account } = useAuth();
  const canManage = Boolean(account && allowed(account.permissions, "departments.manage"));

  return (
    <RequirePermission permission="departments.view" title="Departments">
      <div className="space-y-6">
        <CreateDepartmentForm />
        <RecordBrowser<Department>
          title="Departments"
          resource="departments"
          path="/departments/"
          emptyLabel="departments"
          columns={[
            { key: "name", header: "Name", cell: (row) => row.name },
            { key: "code", header: "Code", cell: (row) => row.code },
            {
              key: "status",
              header: "Status",
              cell: (row) => <StatusText value={row.is_active ? "active" : "inactive"} />,
            },
            {
              key: "actions",
              header: "Actions",
              cell: (row) =>
                canManage ? (
                  <ToggleActiveButton
                    path={`/departments/${row.id}/`}
                    active={row.is_active}
                    resource="departments"
                    label="Department"
                  />
                ) : (
                  "—"
                ),
            },
          ]}
        />
      </div>
    </RequirePermission>
  );
}
