"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

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
import type { Branch } from "@/lib/api/types";
import { orgCreateSchema, validateForm } from "@/lib/forms/schemas";
import { isOnline } from "@/offline/connectivity/network";
import { requireOnlineMutation } from "@/offline/sync/policy";

function CreateBranchForm() {
  const { account } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("branches.create", isOnline());
      return api<Branch>("/branches/", { method: "POST", body: JSON.stringify({ name, code }) });
    },
    onSuccess: async () => {
      setName("");
      setCode("");
      setError(null);
      toast.success("Branch created.");
      await queryClient.invalidateQueries({ queryKey: ["branches"] });
    },
    onError: (caught) => setError(caught),
  });

  if (!account || !allowed(account.permissions, "branches.manage")) {
    return null;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!validateForm(orgCreateSchema, { name, code }, setError)) {
      return;
    }
    mutation.mutate();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add branch</CardTitle>
        <CardDescription>Create a site within the clinic.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="branch_name">Name</Label>
            <Input id="branch_name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="branch_code">Code</Label>
            <Input id="branch_code" value={code} onChange={(event) => setCode(event.target.value)} />
            <FormFieldError error={error} name="code" />
          </div>
          <div className="md:col-span-2">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Create branch"}
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

export function BranchesScreen() {
  const { account } = useAuth();
  const canManage = Boolean(account && allowed(account.permissions, "branches.manage"));

  return (
    <RequirePermission permission="branches.view" title="Branches">
      <div className="space-y-6">
        <CreateBranchForm />
        <RecordBrowser<Branch>
          title="Branches"
          resource="branches"
          path="/branches/"
          emptyLabel="branches"
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
                    path={`/branches/${row.id}/`}
                    active={row.is_active}
                    resource="branches"
                    label="Branch"
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
