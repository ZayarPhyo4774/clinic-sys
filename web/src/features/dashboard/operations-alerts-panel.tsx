"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CreditCard, Pill } from "lucide-react";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { allowed } from "@/features/access/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import { withQuery } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { loadCachedPage } from "@/offline/repositories/read-repository";
import { cn } from "@/lib/utils";

type AlertSource = {
  label: string;
  description: string;
  permission: string;
  href: string;
  paths: string[];
  icon: typeof Pill;
};

const alertSources: AlertSource[] = [
  {
    label: "Low stock",
    description: "Medicines at or below reorder level",
    permission: "pharmacy.view",
    href: "/pharmacy",
    paths: [withQuery("/medicines/", { low_stock: "true", page_size: "1" })],
    icon: Pill,
  },
  {
    label: "Pending dispense",
    description: "Active or partially dispensed prescriptions",
    permission: "prescriptions.view",
    href: "/prescriptions",
    paths: [
      withQuery("/prescriptions/", { status: "active", page_size: "1" }),
      withQuery("/prescriptions/", { status: "partially_dispensed", page_size: "1" }),
    ],
    icon: AlertTriangle,
  },
  {
    label: "Unpaid invoices",
    description: "Issued or partially paid invoices",
    permission: "billing.view",
    href: "/billing",
    paths: [withQuery("/invoices/", { open_for_payment: "true", page_size: "1" })],
    icon: CreditCard,
  },
];

export function OperationsAlertsPanel() {
  const { account } = useAuth();
  if (!account) {
    return null;
  }

  const visible = alertSources.filter((source) => allowed(account.permissions, source.permission));
  if (visible.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Needs attention</h2>
        <p className="text-sm text-muted-foreground">Operational items that may need follow-up today.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((source) => (
          <AlertCard key={source.label} source={source} />
        ))}
      </div>
    </section>
  );
}

function AlertCard({ source }: { source: AlertSource }) {
  const { account, branchId } = useAuth();
  const Icon = source.icon;
  const query = useQuery({
    queryKey: ["dashboard", "alert", source.label, source.paths, branchId],
    queryFn: async () => {
      const counts = await Promise.all(
        source.paths.map((path) =>
          loadCachedPage<unknown>({
            path,
            userId: account?.id ?? null,
            branchId,
          }),
        ),
      );
      return counts.reduce((total, item) => total + item.page.count, 0);
    },
  });

  let value = "…";
  if (query.isError) {
    value = query.error instanceof ApiError && query.error.status === 404 ? "—" : "Error";
  } else if (query.data !== undefined) {
    value = String(query.data);
  }

  const highlight = query.data !== undefined && query.data > 0;

  return (
    <Link
      href={source.href}
      className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Card
        className={cn(
          "h-full transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-premium-md",
          highlight ? "border-warning/40 bg-warning/5" : "",
        )}
      >
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{source.label}</CardTitle>
          <span
            className={cn(
              "flex size-9 items-center justify-center rounded-lg",
              highlight ? "bg-warning/20 text-warning-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
          </span>
        </CardHeader>
        <CardContent>
          <div className={cn("text-3xl font-bold tracking-tight", highlight && "text-warning-foreground")}>
            {query.isLoading ? <Skeleton className="h-9 w-12" /> : value}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{source.description}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
