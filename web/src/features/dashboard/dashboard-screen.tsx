"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  Calendar,
  ClipboardList,
  CreditCard,
  FlaskConical,
  Pill,
  Stethoscope,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { QueryState, describeError } from "@/components/query-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AssignedBranchSelect } from "@/components/assigned-branch-select";
import { allowed, navigationFor } from "@/features/access/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import { withQuery } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { OperationsAlertsPanel } from "@/features/dashboard/operations-alerts-panel";
import { QuickActionsPanel } from "@/features/dashboard/quick-actions-panel";
import { TodayAtAGlance } from "@/features/dashboard/today-at-a-glance";
import { loadCachedPage } from "@/offline/repositories/read-repository";
import { cn } from "@/lib/utils";

const sources: Array<{
  label: string;
  permission: string;
  path: string;
  href: string;
  icon: LucideIcon;
  accent: string;
}> = [
  { label: "Patients", permission: "patients.view", path: "/patients/", href: "/patients", icon: Users, accent: "bg-primary/10 text-primary" },
  { label: "Appointments", permission: "appointments.view", path: "/appointments/", href: "/appointments", icon: Calendar, accent: "bg-info/12 text-info" },
  { label: "Queue", permission: "appointments.view", path: "/queue-entries/", href: "/queue", icon: ClipboardList, accent: "bg-warning/15 text-warning-foreground" },
  { label: "Consultations", permission: "encounters.view", path: "/encounters/", href: "/consultation", icon: Stethoscope, accent: "bg-success/12 text-success" },
  { label: "Prescriptions", permission: "prescriptions.view", path: "/prescriptions/", href: "/prescriptions", icon: ClipboardList, accent: "bg-primary/10 text-primary" },
  { label: "Medicines", permission: "pharmacy.view", path: "/medicines/", href: "/pharmacy", icon: Pill, accent: "bg-info/12 text-info" },
  { label: "Lab orders", permission: "laboratory.view", path: "/lab-orders/", href: "/laboratory", icon: FlaskConical, accent: "bg-success/12 text-success" },
  { label: "Invoices", permission: "billing.view", path: "/invoices/", href: "/billing", icon: CreditCard, accent: "bg-warning/15 text-warning-foreground" },
  { label: "Branches", permission: "branches.view", path: "/branches/", href: "/branches", icon: Building2, accent: "bg-muted text-muted-foreground" },
  { label: "Departments", permission: "departments.view", path: "/departments/", href: "/departments", icon: Building2, accent: "bg-muted text-muted-foreground" },
  { label: "Staff", permission: "staff.view", path: "/staff/", href: "/staff", icon: Users, accent: "bg-muted text-muted-foreground" },
];

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function DashboardScreen() {
  const { isLoading, account, error, refetchAccount } = useAuth();

  if (isLoading) {
    return <QueryState status="loading" />;
  }
  if (error || !account) {
    return <QueryState status="error" detail={describeError(error)} onRetry={() => refetchAccount()} />;
  }

  const visible = sources.filter((source) => allowed(account.permissions, source.permission));
  const displayName = account.full_name?.split(" ")[0] || account.email;

  return (
    <section className="space-y-8">
      <PageHeader
        eyebrow="Overview"
        title={`${greeting()}, ${displayName}`}
        description="Your clinic at a glance. Counts are loaded from the API in real time."
      />
      <QuickActionsPanel />
      <TodayAtAGlance />
      <OperationsAlertsPanel />
      {account.access_block_reason === "branch_required" || account.requires_branch_selection ? (
        <QueryState
          status="branch_required"
          title="Select a branch to continue"
          detail={
            account.assigned_branches.length === 1
              ? "Your role applies to one branch. Confirm the branch below to activate your permissions."
              : "Your role is limited to specific branches. Choose one to load permissions and open clinic modules."
          }
          action={<AssignedBranchSelect />}
        />
      ) : account.access_block_reason === "no_role" ||
        (!account.has_role_assignments && account.permissions.length === 0) ? (
        <QueryState
          status="empty"
          title="No role assigned"
          detail="This account can sign in, but no role has been assigned yet. Ask a clinic administrator to assign a role in the operator console or under Roles."
        />
      ) : account.access_block_reason === "role_empty" ? (
        <QueryState
          status="empty"
          title="Role has no permissions"
          detail="A role is assigned to this account, but that role has no permission codes. Edit the role in the operator console or Roles screen and add module permissions such as patients.view."
        />
      ) : visible.length === 0 ? (
        <DashboardFallbackLinks permissions={account.permissions} />
      ) : (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Module summaries</h2>
            <p className="text-sm text-muted-foreground">Record counts across your accessible modules.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {visible.map((source) => (
              <CountCard key={source.path} source={source} />
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

function DashboardFallbackLinks({ permissions }: { permissions: string[] }) {
  const links = navigationFor(permissions).filter(
    (item) => item.href !== "/" && item.href !== "/settings",
  );

  if (links.length === 0) {
    return (
      <QueryState
        status="empty"
        detail="This account has no list permissions for the clinic modules."
      />
    );
  }

  return (
    <QueryState
      status="empty"
      title="No module summaries yet"
      detail="Your permissions focus on administration and setup. Open one of the screens below to get started."
      action={
        <div className="flex flex-wrap justify-center gap-2">
          {links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg border bg-background px-4 py-2 text-sm font-medium shadow-premium-sm transition-colors hover:bg-accent"
            >
              {item.label}
            </Link>
          ))}
        </div>
      }
    />
  );
}

function CountCard({
  source,
}: {
  source: (typeof sources)[number];
}) {
  const { account, branchId } = useAuth();
  const Icon = source.icon;
  const query = useQuery({
    queryKey: ["dashboard", source.path, branchId],
    queryFn: () =>
      loadCachedPage<unknown>({
        path: withQuery(source.path, { page_size: "1" }),
        userId: account?.id ?? null,
        branchId,
      }),
  });

  let value = "…";
  if (query.isError) {
    value = query.error instanceof ApiError && query.error.status === 404 ? "Not available" : "Error";
  } else if (query.data) {
    value = String(query.data.page.count);
  }

  return (
    <Link
      href={source.href}
      className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Card className="h-full border-transparent bg-card/80 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/15 group-hover:shadow-premium-md">
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{source.label}</CardTitle>
          <span className={cn("flex size-9 items-center justify-center rounded-lg", source.accent)}>
            <Icon className="size-4" aria-hidden="true" />
          </span>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold tracking-tight" aria-live="polite">
            {query.isLoading ? <Skeleton className="h-9 w-16" /> : value}
          </div>
          {query.isError && !(query.error instanceof ApiError && query.error.status === 404) ? (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {describeError(query.error)}
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
              View {source.label.toLowerCase()} →
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
