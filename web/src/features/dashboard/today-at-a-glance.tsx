"use client";

import { Banknote, ClipboardList, Stethoscope, Users } from "lucide-react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { QueryState, describeError } from "@/components/query-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/features/billing/billing-utils";
import { allowed } from "@/features/access/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import { todayIso } from "@/features/reports/report-utils";
import { api, withQuery } from "@/lib/api/client";

type TodaySummary = {
  currency: string;
  locale: string;
  payments_collected: string;
  patients_seen: number;
  appointment_count: number;
  encounters_completed: number;
  open_invoice_count: number;
  outstanding_balance: string;
};

export function TodayAtAGlance() {
  const { account, branchId } = useAuth();
  const canView = account ? allowed(account.permissions, "reports.view") : false;

  const query = useQuery({
    queryKey: ["reports", "summary", "today", branchId],
    queryFn: () =>
      api<TodaySummary>(
        withQuery("/reports/summary/", {
          date: todayIso(),
        }),
      ),
    enabled: canView && Boolean(branchId),
  });

  if (!canView) {
    return null;
  }

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Today at a glance</h2>
          <p className="text-sm text-muted-foreground">Live summary from the reports service for {todayIso()}.</p>
        </div>
        <Link href="/reports" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          Full reports →
        </Link>
      </div>

      {query.isLoading ? <QueryState status="loading" /> : null}
      {query.isError ? (
        <QueryState status="error" detail={describeError(query.error)} onRetry={() => void query.refetch()} />
      ) : null}

      {query.data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <GlanceCard
            icon={Banknote}
            label="Collected today"
            value={formatMoney(query.data.currency, query.data.payments_collected, query.data.locale)}
            hint={`${query.data.open_invoice_count} open invoices · ${formatMoney(query.data.currency, query.data.outstanding_balance, query.data.locale)} outstanding`}
          />
          <GlanceCard icon={Users} label="Patients seen" value={String(query.data.patients_seen)} hint="Encounters and completed visits" />
          <GlanceCard icon={ClipboardList} label="Appointments" value={String(query.data.appointment_count)} hint="Scheduled for today" />
          <GlanceCard icon={Stethoscope} label="Encounters completed" value={String(query.data.encounters_completed)} hint="Clinical workload" />
        </div>
      ) : null}
    </section>
  );
}

function GlanceCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Banknote;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card className="border-transparent bg-card/80 shadow-premium-sm">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
