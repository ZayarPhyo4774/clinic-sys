"use client";

import { Calendar, Mail } from "lucide-react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { DetailField, DetailGrid, DetailSection } from "@/components/detail-fields";
import { DetailLayout } from "@/components/detail-layout";
import { DetailPageState } from "@/components/detail-page-state";
import { StatusText } from "@/components/record-browser";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { allowed } from "@/features/access/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import { RequirePermission } from "@/features/access/require-permission";
import { ToggleActiveButton } from "@/features/organization/org-writes";
import {
  DoctorProfileForm,
  EditStaffForm,
  NurseProfileForm,
} from "@/features/organization/staff-writes";
import { StaffTypeBadge } from "@/features/organization/staff-type-badge";
import { useDetailQuery } from "@/hooks/use-detail-query";
import { useResourceList } from "@/hooks/use-resource-list";
import { api, withQuery } from "@/lib/api/client";
import type { Branch, Department, DoctorProfile, NurseProfile, Page, Staff } from "@/lib/api/types";

export function StaffDetailScreen({ staffId }: { staffId: string }) {
  return (
    <RequirePermission permission="staff.view" title="Staff member">
      <StaffDetail staffId={staffId} />
    </RequirePermission>
  );
}

function StaffDetail({ staffId }: { staffId: string }) {
  const { account } = useAuth();
  const canManage = Boolean(account && allowed(account.permissions, "staff.manage"));
  const query = useDetailQuery<Staff>("staff", `/staff/${staffId}/`);

  const doctorProfile = useQuery({
    queryKey: ["doctor-profiles", staffId],
    enabled: Boolean(query.data?.staff_type === "doctor"),
    queryFn: async () => {
      const page = await api<Page<DoctorProfile>>(withQuery("/doctor-profiles/", { staff: staffId }));
      return page.results[0] ?? null;
    },
  });

  const branches = useResourceList<Branch>("branches", withQuery("/branches/", { page_size: "100" }));
  const departments = useResourceList<Department>(
    "departments",
    query.data?.branch
      ? withQuery("/departments/", { page_size: "100", branch: query.data.branch })
      : null,
  );

  const nurseProfile = useQuery({
    queryKey: ["nurse-profiles", staffId],
    enabled: Boolean(query.data?.staff_type === "nurse"),
    queryFn: async () => {
      const page = await api<Page<NurseProfile>>(withQuery("/nurse-profiles/", { staff: staffId }));
      return page.results[0] ?? null;
    },
  });

  const state = (
    <DetailPageState
      title="Staff member"
      isLoading={query.isLoading}
      error={query.error}
      onRetry={() => void query.refetch()}
    />
  );

  if (query.isLoading || query.error || !query.data) {
    return state;
  }

  const staff = query.data;
  const displayName = staff.user_full_name || staff.user_email;
  const branchName = branches.data?.find((row) => row.id === staff.branch)?.name ?? staff.branch;
  const departmentName =
    departments.data?.find((row) => row.id === staff.department)?.name ?? staff.department ?? "—";

  return (
    <DetailLayout
      breadcrumbs={[
        { label: "Dashboard", href: "/" },
        { label: "Staff", href: "/staff" },
        { label: displayName },
      ]}
      title={displayName}
      description="Workforce assignment and clinical profile"
    >
      <Card className="shadow-premium-sm">
        <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <StaffTypeBadge value={staff.staff_type} />
              <StatusText value={staff.is_active ? "active" : "inactive"} />
            </div>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="size-4 shrink-0" aria-hidden="true" />
              {staff.user_email}
            </p>
            <p className="text-sm text-muted-foreground">
              Job title: <span className="font-medium text-foreground">{staff.job_title || "Not set"}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {staff.staff_type === "doctor" && allowed(account?.permissions ?? [], "appointments.view") ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/schedules">
                  <Calendar className="size-4" aria-hidden="true" />
                  Schedules
                </Link>
              </Button>
            ) : null}
            {canManage ? (
              <ToggleActiveButton
                path={`/staff/${staff.id}/`}
                active={staff.is_active}
                resource="staff"
                label="Staff member"
              />
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview" className="mt-8">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {staff.staff_type === "doctor" || staff.staff_type === "nurse" ? (
            <TabsTrigger value="clinical">Clinical profile</TabsTrigger>
          ) : null}
          {canManage ? <TabsTrigger value="edit">Edit</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6">
          <DetailSection title="Assignment">
            <DetailGrid>
              <DetailField label="Full name" value={staff.user_full_name || "—"} />
              <DetailField label="Email" value={staff.user_email} />
              <DetailField label="Staff type" value={<StaffTypeBadge value={staff.staff_type} />} />
              <DetailField label="Job title" value={staff.job_title || "—"} />
              <DetailField label="Status" value={<StatusText value={staff.is_active ? "active" : "inactive"} />} />
              <DetailField label="Branch" value={branchName} />
              <DetailField label="Department" value={departmentName} />
            </DetailGrid>
          </DetailSection>

          {staff.staff_type === "doctor" ? (
            <DetailSection title="Doctor profile summary">
              {doctorProfile.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading profile…</p>
              ) : doctorProfile.data ? (
                <DetailGrid>
                  <DetailField label="License" value={doctorProfile.data.license_number} />
                  <DetailField label="Specialty" value={doctorProfile.data.specialty} />
                </DetailGrid>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No doctor profile yet. {canManage ? "Add one under Clinical profile or Edit." : ""}
                </p>
              )}
            </DetailSection>
          ) : null}

          {staff.staff_type === "nurse" ? (
            <DetailSection title="Nurse profile summary">
              {nurseProfile.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading profile…</p>
              ) : nurseProfile.data ? (
                <DetailGrid>
                  <DetailField label="License" value={nurseProfile.data.license_number} />
                  <DetailField label="Grade" value={nurseProfile.data.grade || "—"} />
                </DetailGrid>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No nurse profile yet. {canManage ? "Add one under Clinical profile or Edit." : ""}
                </p>
              )}
            </DetailSection>
          ) : null}
        </TabsContent>

        {staff.staff_type === "doctor" || staff.staff_type === "nurse" ? (
          <TabsContent value="clinical" className="mt-6 space-y-6">
            {staff.staff_type === "doctor" ? (
              <Card className="shadow-premium-sm">
                <CardHeader>
                  <CardTitle className="text-base">Doctor profile</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-4 text-sm text-muted-foreground">
                    Required for appointments, consultations, and prescriptions. Use a real specialty such as
                    &quot;General practice&quot; — not a job title like &quot;Head&quot;.
                  </p>
                  {canManage ? (
                    <DoctorProfileForm
                      staffId={staff.id}
                      profile={doctorProfile.data ?? null}
                      onSaved={() => void doctorProfile.refetch()}
                    />
                  ) : doctorProfile.data ? (
                    <DetailGrid>
                      <DetailField label="License" value={doctorProfile.data.license_number} />
                      <DetailField label="Specialty" value={doctorProfile.data.specialty} />
                    </DetailGrid>
                  ) : (
                    <p className="text-sm text-muted-foreground">No doctor profile on file.</p>
                  )}
                </CardContent>
              </Card>
            ) : null}

            {staff.staff_type === "nurse" ? (
              <Card className="shadow-premium-sm">
                <CardHeader>
                  <CardTitle className="text-base">Nurse profile</CardTitle>
                </CardHeader>
                <CardContent>
                  {canManage ? (
                    <NurseProfileForm
                      staffId={staff.id}
                      profile={nurseProfile.data ?? null}
                      onSaved={() => void nurseProfile.refetch()}
                    />
                  ) : nurseProfile.data ? (
                    <DetailGrid>
                      <DetailField label="License" value={nurseProfile.data.license_number} />
                      <DetailField label="Grade" value={nurseProfile.data.grade || "—"} />
                    </DetailGrid>
                  ) : (
                    <p className="text-sm text-muted-foreground">No nurse profile on file.</p>
                  )}
                </CardContent>
              </Card>
            ) : null}
          </TabsContent>
        ) : null}

        {canManage ? (
          <TabsContent value="edit" className="mt-6 space-y-6">
            <Card className="shadow-premium-sm">
              <CardHeader>
                <CardTitle className="text-base">Update assignment</CardTitle>
              </CardHeader>
              <CardContent>
                <EditStaffForm staff={staff} onUpdated={() => void query.refetch()} />
              </CardContent>
            </Card>

            {staff.staff_type === "doctor" ? (
              <Card className="border-dashed shadow-premium-sm">
                <CardHeader>
                  <CardTitle className="text-base">Doctor credentials</CardTitle>
                </CardHeader>
                <CardContent>
                  <DoctorProfileForm
                    staffId={staff.id}
                    profile={doctorProfile.data ?? null}
                    onSaved={() => void doctorProfile.refetch()}
                  />
                </CardContent>
              </Card>
            ) : null}

            {staff.staff_type === "nurse" ? (
              <Card className="border-dashed shadow-premium-sm">
                <CardHeader>
                  <CardTitle className="text-base">Nurse credentials</CardTitle>
                </CardHeader>
                <CardContent>
                  <NurseProfileForm
                    staffId={staff.id}
                    profile={nurseProfile.data ?? null}
                    onSaved={() => void nurseProfile.refetch()}
                  />
                </CardContent>
              </Card>
            ) : null}
          </TabsContent>
        ) : null}
      </Tabs>
    </DetailLayout>
  );
}
