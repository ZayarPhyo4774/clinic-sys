"use client";

import { useQuery } from "@tanstack/react-query";

import { BranchIndicator } from "@/components/branch-indicator";
import { QueryState, describeError } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { allowed } from "@/features/access/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import { EditClinicForm } from "@/features/settings/clinic-writes";
import { withQuery } from "@/lib/api/client";
import type { Clinic } from "@/lib/api/types";
import { loadCachedPage } from "@/offline/repositories/read-repository";

export function SettingsScreen() {
  const { isLoading, account, error, refetchAccount, branchId, setBranchId, signOut } = useAuth();
  const permissions = account?.permissions ?? [];
  const canViewBranches = allowed(permissions, "branches.view");
  const canViewClinics = allowed(permissions, "clinics.view");

  const clinics = useQuery({
    queryKey: ["clinics", branchId],
    enabled: Boolean(account) && canViewClinics,
    queryFn: () =>
      loadCachedPage<Clinic>({
        path: withQuery("/clinics/", { page_size: "20" }),
        userId: account?.id ?? null,
        branchId,
      }),
  });

  if (isLoading) {
    return <QueryState status="loading" />;
  }
  if (error || !account) {
    return <QueryState status="error" detail={describeError(error)} onRetry={() => refetchAccount()} />;
  }

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Details returned for the current session.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">Name: </span>
            {account.full_name || "—"}
          </p>
          <p>
            <span className="text-muted-foreground">Email: </span>
            {account.email}
          </p>
          <p>
            <span className="text-muted-foreground">Clinic id: </span>
            {account.clinic_id || "—"}
          </p>
          <Button type="button" variant="outline" onClick={signOut}>
            Sign out
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Branch</CardTitle>
          <CardDescription>
            The selected branch is sent as X-Branch-Id. Permissions are loaded again for that branch.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {canViewBranches ? (
            <BranchIndicator />
          ) : (account.assigned_branches?.length ?? 0) > 0 ? (
            <BranchIndicator />
          ) : (
            <p className="text-sm text-muted-foreground">
              Branch selection is unavailable for this account. Ask an administrator to assign a clinic-wide role or
              grant branch access.
            </p>
          )}
          {branchId && !canViewBranches && (account.assigned_branches?.length ?? 0) > 0 ? (
            <Button type="button" variant="outline" onClick={() => setBranchId(null)}>
              Clear selected branch
            </Button>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Clinic</CardTitle>
        </CardHeader>
        <CardContent>
          {canViewClinics ? (
            <>
              {clinics.isLoading ? <QueryState status="loading" /> : null}
              {clinics.isError ? (
                <QueryState status="error" detail={describeError(clinics.error)} onRetry={() => void clinics.refetch()} />
              ) : null}
              {clinics.data && clinics.data.page.results.length === 0 ? (
                <QueryState status="empty" detail="No clinic record is available." />
              ) : null}
              {clinics.data && clinics.data.page.results.length > 0 ? (
                <ul className="space-y-6 text-sm">
                  {clinics.data.page.results.map((clinic) => (
                    <li key={clinic.id} className="space-y-3">
                      <p className="font-medium">{clinic.name}</p>
                      <p className="text-muted-foreground">
                        {clinic.code} · {clinic.timezone} · {clinic.currency} · {clinic.locale}
                      </p>
                      <EditClinicForm clinic={clinic} onUpdated={() => void clinics.refetch()} />
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Clinic details are unavailable for this account.</p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
