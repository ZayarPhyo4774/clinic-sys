"use client";

import { Stethoscope, UserCog, Users } from "lucide-react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { QueryState, describeError } from "@/components/query-state";
import { StatusText } from "@/components/record-browser";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { allowed } from "@/features/access/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import { RequirePermission } from "@/features/access/require-permission";
import { staffTypeOptions } from "@/features/organization/contract";
import { LinkStaffForm } from "@/features/organization/staff-writes";
import { StaffTypeBadge } from "@/features/organization/staff-type-badge";
import { api, withQuery } from "@/lib/api/client";
import type { Page, Staff } from "@/lib/api/types";

const ALL_TYPES = "__all__";

export function StaffScreen() {
  return (
    <RequirePermission permission="staff.view" title="Staff">
      <StaffDirectory />
    </RequirePermission>
  );
}

function StaffDirectory() {
  const { account } = useAuth();
  const canManage = Boolean(account && allowed(account.permissions, "staff.manage"));
  const [tab, setTab] = useState("directory");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState(ALL_TYPES);

  const staffQuery = useQuery({
    queryKey: ["staff", "directory", typeFilter],
    queryFn: async () => {
      const page = await api<Page<Staff>>(
        withQuery("/staff/", {
          page_size: "200",
          staff_type: typeFilter === ALL_TYPES ? undefined : typeFilter,
        }),
      );
      return page.results;
    },
  });

  const rows = staffQuery.data ?? [];
  const doctorCount = rows.filter((row) => row.staff_type === "doctor").length;
  const nurseCount = rows.filter((row) => row.staff_type === "nurse").length;
  const activeCount = rows.filter((row) => row.is_active).length;

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) {
      return rows;
    }
    return rows.filter(
      (row) =>
        row.user_full_name.toLowerCase().includes(needle) ||
        row.user_email.toLowerCase().includes(needle) ||
        (row.job_title ?? "").toLowerCase().includes(needle),
    );
  }, [rows, search]);

  return (
    <section className="space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Staff"
        description="Link clinic users to branches as doctors, nurses, or other staff. Doctors need a profile and schedule before booking appointments."
        action={
          canManage ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => setTab("link")}>
                Link staff
              </Button>
              <Button asChild variant="outline">
                <Link href="/schedules">Schedules</Link>
              </Button>
            </div>
          ) : null
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="shadow-premium-sm">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-xl bg-primary/10 p-3 text-primary">
              <Users className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">{rows.length}</p>
              <p className="text-sm text-muted-foreground">Staff linked</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-premium-sm">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-xl bg-primary/10 p-3 text-primary">
              <Stethoscope className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">{doctorCount}</p>
              <p className="text-sm text-muted-foreground">Doctors</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-premium-sm">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-xl bg-primary/10 p-3 text-primary">
              <UserCog className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">{activeCount}</p>
              <p className="text-sm text-muted-foreground">Active ({nurseCount} nurses)</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {canManage ? (
        <Card className="border-primary/20 bg-primary/5 shadow-premium-sm">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">Solo clinic doctor setup</p>
              <p className="text-sm text-muted-foreground">
                Link the doctor with type <Badge variant="info">Doctor</Badge>, job title &quot;Physician&quot;, then add a
                schedule before booking appointments.
              </p>
            </div>
            <Button type="button" onClick={() => setTab("link")}>
              Link doctor
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="directory">Directory</TabsTrigger>
          {canManage ? <TabsTrigger value="link">Link staff</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="directory" className="mt-6 space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <Input
              placeholder="Search by name, email, or job title…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="max-w-md"
            />
            <div className="flex flex-wrap items-center gap-3">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent position="popper" className="z-[100]">
                  <SelectItem value={ALL_TYPES}>All types</SelectItem>
                  {staffTypeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                {filtered.length} of {rows.length} shown
              </p>
            </div>
          </div>

          {staffQuery.isLoading ? <QueryState status="loading" /> : null}
          {staffQuery.isError ? (
            <QueryState status="error" detail={describeError(staffQuery.error)} onRetry={() => void staffQuery.refetch()} />
          ) : null}
          {staffQuery.data ? (
            <Card className="shadow-premium-sm">
              <CardContent className="p-0">
                <div className="overflow-hidden rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Job title</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-28" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                            {rows.length === 0
                              ? "No staff linked yet. Create a user first, then link them under Link staff."
                              : "No staff match your filters."}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filtered.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{row.user_full_name || row.user_email}</p>
                                <p className="text-xs text-muted-foreground">{row.user_email}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <StaffTypeBadge value={row.staff_type} />
                            </TableCell>
                            <TableCell>{row.job_title || "—"}</TableCell>
                            <TableCell>
                              <StatusText value={row.is_active ? "active" : "inactive"} />
                            </TableCell>
                            <TableCell>
                              <Button asChild size="sm" variant="outline">
                                <Link href={`/staff/${row.id}`}>Open</Link>
                              </Button>
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

        {canManage ? (
          <TabsContent value="link" className="mt-6">
            <Card className="mx-auto max-w-3xl shadow-premium-sm">
              <CardHeader>
                <CardTitle>Link staff member</CardTitle>
                <CardDescription>
                  Assign an existing clinic user to a branch. Create the user under{" "}
                  <Link href="/users" className="font-medium text-primary hover:underline">
                    Users
                  </Link>{" "}
                  first if needed.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <LinkStaffForm onLinked={() => setTab("directory")} />
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}
      </Tabs>
    </section>
  );
}
