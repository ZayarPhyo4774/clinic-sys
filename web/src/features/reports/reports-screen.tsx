"use client";

import {
  Activity,
  Banknote,
  ClipboardList,
  Download,
  FlaskConical,
  Pill,
  Receipt,
  Stethoscope,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";

import { DetailField, DetailGrid, DetailSection } from "@/components/detail-fields";
import { PageHeader } from "@/components/page-header";
import { QueryState, describeError } from "@/components/query-state";
import { StatusText } from "@/components/record-browser";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBillingLookups } from "@/features/billing/billing-lookups";
import { formatMoney } from "@/features/billing/billing-utils";
import { RequirePermission } from "@/features/access/require-permission";
import { useAuth } from "@/features/auth/auth-provider";
import {
  type DatePreset,
  type ReportRange,
  downloadReportCsv,
  formatRangeLabel,
  rangeFromPreset,
  rangeQueryParams,
  todayIso,
} from "@/features/reports/report-utils";
import { api, withQuery } from "@/lib/api/client";
import { cn } from "@/lib/utils";

type ReportMeta = {
  from: string;
  to: string;
  date?: string | null;
  currency: string;
  locale: string;
};

type ReportsSummary = ReportMeta & {
  appointments_by_status: Record<string, number>;
  queue_by_status: Record<string, number>;
  appointment_count: number;
  queue_count: number;
  active_patients: number;
  patients_seen: number;
  walk_in_count: number;
  no_show_count: number;
  cancellation_count: number;
  encounters_completed: number;
  invoice_count: number;
  invoice_total: string;
  issued_invoice_count: number;
  issued_invoice_total: string;
  manual_invoice_count: number;
  payments_collected: string;
  payments_by_method: Record<string, string>;
  revenue_by_kind: Record<string, string>;
  outstanding_balance: string;
  open_invoice_count: number;
};

type ReportsFinancial = ReportMeta & {
  payments_collected: string;
  refunds_total: string;
  net_collected: string;
  payments_by_method: Record<string, string>;
  refunds_by_reason: Record<string, string>;
  issued_invoice_count: number;
  issued_invoice_total: string;
  revenue_by_kind: Record<string, string>;
  doctor_revenue: Array<{
    doctor_id: string;
    doctor_name: string;
    invoice_count: number;
    total: string;
  }>;
  manual_invoices: { count: number; total: string };
  encounter_invoices: { count: number; total: string };
  outstanding_balance: string;
  open_invoice_count: number;
  ar_aging: {
    counts: Record<string, number>;
    amounts: Record<string, string>;
  };
};

type ReportsOperations = ReportMeta & {
  appointment_count: number;
  appointments_by_status: Record<string, number>;
  walk_in_count: number;
  scheduled_count: number;
  no_show_count: number;
  cancellation_count: number;
  completed_appointments: number;
  no_show_rate: number;
  queue_count: number;
  queue_by_status: Record<string, number>;
  queue_skipped: number;
  queue_cancelled: number;
  avg_wait_minutes: number | null;
  avg_service_minutes: number | null;
  patients_seen: number;
  encounters_started: number;
  encounters_completed: number;
  new_patients: number;
  peak_appointment_hours: Record<string, number>;
  demographics_by_sex: Record<string, number>;
};

type ReportsClinical = ReportMeta & {
  encounter_count: number;
  encounters_by_status: Record<string, number>;
  encounters_completed: number;
  avg_consult_minutes: number | null;
  prescription_count: number;
  prescriptions_by_status: Record<string, number>;
  prescription_items: number;
  prescribed_quantity: number;
  dispensed_quantity: number;
  fill_rate_percent: number | null;
  top_diagnoses: Array<{ code: string; description: string; count: number }>;
  follow_ups_due_7_days: number;
  follow_ups_due_30_days: number;
};

type ReportsPharmacy = ReportMeta & {
  medicines_tracked: number;
  total_units_on_hand: number;
  low_stock_items: Array<{
    medicine_id: string;
    medicine_code: string;
    medicine_name: string;
    quantity_on_hand: number;
    reorder_level: number;
  }>;
  low_stock_count: number;
  expiring_within_30_days: number;
  expiring_within_60_days: number;
  expiring_within_90_days: number;
  dispense_by_medicine: Array<{ medicine_id: string; code: string; name: string; units: number }>;
  movement_summary: { stock_in_units: number; dispense_units: number; adjustment_units: number };
  adjustments_by_reason: Record<string, number>;
};

type ReportsLaboratory = ReportMeta & {
  order_count: number;
  orders_by_status: Record<string, number>;
  completed_orders: number;
  median_turnaround_hours: number | null;
  tests_by_volume: Array<{ lab_test_id: string; code: string; name: string; count: number }>;
  result_count: number;
  abnormal_result_count: number;
  abnormal_rate_percent: number | null;
  interpretation_breakdown: Record<string, number>;
};

type ReportsTrends = ReportMeta & {
  series: Array<{
    date: string;
    payments_collected: string;
    issued_total: string;
    appointments: number;
    encounters: number;
  }>;
  comparison: Record<
    string,
    { current: string | number; prior: string | number; change_percent: number | null }
  >;
};

const TAB_EXPORT: Record<string, string> = {
  overview: "summary",
  financial: "financial",
  operations: "operations",
  clinical: "clinical",
  pharmacy: "pharmacy",
  laboratory: "laboratory",
};

export function ReportsScreen() {
  return (
    <RequirePermission permission="reports.view" title="Reports">
      <ReportsHub />
    </RequirePermission>
  );
}

function ReportsHub() {
  const { branchId } = useAuth();
  const initial = rangeFromPreset("today");
  const [preset, setPreset] = useState<DatePreset>("today");
  const [draftFrom, setDraftFrom] = useState(initial.from);
  const [draftTo, setDraftTo] = useState(initial.to);
  const [range, setRange] = useState<ReportRange>({ preset: "today", ...initial });
  const [tab, setTab] = useState("overview");
  const [exporting, setExporting] = useState(false);

  const queryParams = useMemo(() => rangeQueryParams(range), [range]);
  const rangeLabel = formatRangeLabel(range.from, range.to);
  const isSingleDay = range.from === range.to;

  const summary = useQuery({
    queryKey: ["reports", "summary", range, branchId],
    queryFn: () => api<ReportsSummary>(withQuery("/reports/summary/", queryParams)),
  });
  const financial = useQuery({
    queryKey: ["reports", "financial", range, branchId],
    queryFn: () => api<ReportsFinancial>(withQuery("/reports/financial/", queryParams)),
    enabled: tab === "financial" || tab === "overview",
  });
  const operations = useQuery({
    queryKey: ["reports", "operations", range, branchId],
    queryFn: () => api<ReportsOperations>(withQuery("/reports/operations/", queryParams)),
    enabled: tab === "operations" || tab === "overview",
  });
  const trends = useQuery({
    queryKey: ["reports", "trends", range, branchId],
    queryFn: () => api<ReportsTrends>(withQuery("/reports/trends/", queryParams)),
    enabled: tab === "overview",
  });
  const clinical = useQuery({
    queryKey: ["reports", "clinical", range, branchId],
    queryFn: () => api<ReportsClinical>(withQuery("/reports/clinical/", queryParams)),
    enabled: tab === "clinical",
  });
  const pharmacy = useQuery({
    queryKey: ["reports", "pharmacy", range, branchId],
    queryFn: () => api<ReportsPharmacy>(withQuery("/reports/pharmacy/", queryParams)),
    enabled: tab === "pharmacy",
  });
  const laboratory = useQuery({
    queryKey: ["reports", "laboratory", range, branchId],
    queryFn: () => api<ReportsLaboratory>(withQuery("/reports/laboratory/", queryParams)),
    enabled: tab === "laboratory",
  });

  function applyPreset(next: DatePreset) {
    setPreset(next);
    if (next === "custom") {
      return;
    }
    const nextRange = rangeFromPreset(next);
    setDraftFrom(nextRange.from);
    setDraftTo(nextRange.to);
    setRange({ preset: next, ...nextRange });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPreset("custom");
    setRange({ preset: "custom", from: draftFrom, to: draftTo });
  }

  async function onExport() {
    setExporting(true);
    try {
      await downloadReportCsv(TAB_EXPORT[tab] ?? "summary", queryParams);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  const activeQuery =
    tab === "financial"
      ? financial
      : tab === "operations"
        ? operations
        : tab === "clinical"
          ? clinical
          : tab === "pharmacy"
            ? pharmacy
            : tab === "laboratory"
              ? laboratory
              : summary;

  const currency = summary.data?.currency ?? "USD";
  const locale = summary.data?.locale;

  return (
    <section className="space-y-8">
      <PageHeader
        eyebrow="Operations"
        title="Reports"
        description="Branch-scoped analytics across finance, operations, clinical care, pharmacy, and laboratory."
        action={
          <Button type="button" variant="outline" disabled={exporting} onClick={() => void onExport()}>
            <Download className="mr-2 size-4" aria-hidden="true" />
            Export CSV
          </Button>
        }
      />

      <form className="space-y-4 rounded-xl border bg-card/60 p-4" onSubmit={onSubmit}>
        <div className="flex flex-wrap gap-2">
          {(["today", "7d", "30d"] as const).map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={preset === value ? "default" : "outline"}
              onClick={() => applyPreset(value)}
            >
              {value === "today" ? "Today" : value === "7d" ? "Last 7 days" : "Last 30 days"}
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant={preset === "custom" ? "default" : "outline"}
            onClick={() => setPreset("custom")}
          >
            Custom
          </Button>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="report_from">From</Label>
            <Input id="report_from" type="date" value={draftFrom} onChange={(e) => setDraftFrom(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="report_to">To</Label>
            <Input id="report_to" type="date" value={draftTo} onChange={(e) => setDraftTo(e.target.value)} />
          </div>
          <Button type="submit">Apply range</Button>
        </div>
        <p className="text-sm text-muted-foreground">Showing data for {rangeLabel}</p>
      </form>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="financial">Financial</TabsTrigger>
          <TabsTrigger value="operations">Operations</TabsTrigger>
          <TabsTrigger value="clinical">Clinical</TabsTrigger>
          <TabsTrigger value="pharmacy">Pharmacy</TabsTrigger>
          <TabsTrigger value="laboratory">Laboratory</TabsTrigger>
        </TabsList>

        {activeQuery.isLoading ? <QueryState status="loading" /> : null}
        {activeQuery.isError ? (
          <QueryState status="error" detail={describeError(activeQuery.error)} onRetry={() => void activeQuery.refetch()} />
        ) : null}

        <TabsContent value="overview" className="space-y-8">
          {summary.data ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  icon={Banknote}
                  label={isSingleDay ? "Collected" : "Collected in period"}
                  value={formatMoney(currency, summary.data.payments_collected, locale)}
                  hint={`${rangeLabel} · ${summary.data.open_invoice_count} open invoices`}
                />
                <StatCard
                  icon={Users}
                  label={isSingleDay ? "Patients seen" : "Patients seen in period"}
                  value={String(summary.data.patients_seen)}
                  hint={`${summary.data.walk_in_count} walk-ins · ${summary.data.active_patients} registered active`}
                />
                <StatCard
                  icon={Receipt}
                  label="Issued invoices"
                  value={String(summary.data.issued_invoice_count)}
                  hint={formatMoney(currency, summary.data.issued_invoice_total, locale)}
                />
                <StatCard
                  icon={ClipboardList}
                  label="Appointments"
                  value={String(summary.data.appointment_count)}
                  hint={`${summary.data.encounters_completed} encounters completed`}
                />
              </div>

              {trends.data ? <TrendSection data={trends.data} currency={currency} locale={locale} /> : null}

              <DetailSection title={`Summary · ${rangeLabel}`}>
                <DetailGrid>
                  <DetailField label="Outstanding balance" value={formatMoney(currency, summary.data.outstanding_balance, locale)} />
                  <DetailField label="No-shows" value={summary.data.no_show_count} />
                  <DetailField label="Cancellations" value={summary.data.cancellation_count} />
                  <DetailField label="Manual invoices" value={summary.data.manual_invoice_count} />
                </DetailGrid>
              </DetailSection>

              <DetailSection title="Revenue by service kind">
                <KeyValueGrid
                  values={summary.data.revenue_by_kind}
                  currency={currency}
                  locale={locale}
                  emptyLabel="No issued invoice lines in this period."
                />
              </DetailSection>

              <DetailSection title="Payments by method">
                <PaymentsByMethod
                  values={summary.data.payments_by_method}
                  currency={currency}
                  locale={locale}
                />
              </DetailSection>
            </>
          ) : null}
        </TabsContent>

        <TabsContent value="financial" className="space-y-8">
          {financial.data ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  icon={Banknote}
                  label="Net collected"
                  value={formatMoney(currency, financial.data.net_collected, locale)}
                  hint={`Refunds ${formatMoney(currency, financial.data.refunds_total, locale)}`}
                />
                <StatCard
                  icon={Wallet}
                  label="Outstanding AR"
                  value={formatMoney(currency, financial.data.outstanding_balance, locale)}
                  hint={`${financial.data.open_invoice_count} open invoices`}
                />
                <StatCard
                  icon={Receipt}
                  label="Issued total"
                  value={formatMoney(currency, financial.data.issued_invoice_total, locale)}
                  hint={`${financial.data.issued_invoice_count} invoices`}
                />
                <StatCard
                  icon={Activity}
                  label="Manual invoices"
                  value={String(financial.data.manual_invoices.count)}
                  hint={formatMoney(currency, financial.data.manual_invoices.total, locale)}
                />
              </div>

              <DetailSection title="Accounts receivable aging">
                <DetailGrid>
                  <DetailField label="0–7 days (count)" value={financial.data.ar_aging.counts["0_7"] ?? 0} />
                  <DetailField label="0–7 days (amount)" value={formatMoney(currency, financial.data.ar_aging.amounts["0_7"] ?? "0", locale)} />
                  <DetailField label="8–30 days (count)" value={financial.data.ar_aging.counts["8_30"] ?? 0} />
                  <DetailField label="8–30 days (amount)" value={formatMoney(currency, financial.data.ar_aging.amounts["8_30"] ?? "0", locale)} />
                  <DetailField label="31+ days (count)" value={financial.data.ar_aging.counts["31_plus"] ?? 0} />
                  <DetailField label="31+ days (amount)" value={formatMoney(currency, financial.data.ar_aging.amounts["31_plus"] ?? "0", locale)} />
                </DetailGrid>
                <p className="mt-3 text-sm">
                  <Link href="/billing?status=open" className="text-primary underline-offset-4 hover:underline">
                    View open invoices →
                  </Link>
                </p>
              </DetailSection>

              <DetailSection title="Revenue mix">
                <KeyValueGrid values={financial.data.revenue_by_kind} currency={currency} locale={locale} emptyLabel="No revenue in period." />
              </DetailSection>

              <DetailSection title="Doctor revenue">
                {financial.data.doctor_revenue.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No issued invoices in this period.</p>
                ) : (
                  <BreakdownTable
                    headers={["Doctor", "Invoices", "Total"]}
                    rows={financial.data.doctor_revenue.map((row) => [
                      row.doctor_name,
                      String(row.invoice_count),
                      formatMoney(currency, row.total, locale),
                    ])}
                  />
                )}
              </DetailSection>
            </>
          ) : null}
        </TabsContent>

        <TabsContent value="operations" className="space-y-8">
          {operations.data ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard icon={ClipboardList} label="Appointments" value={String(operations.data.appointment_count)} hint={`${operations.data.walk_in_count} walk-ins`} />
                <StatCard icon={Users} label="Patients seen" value={String(operations.data.patients_seen)} hint={`${operations.data.new_patients} new registrations`} />
                <StatCard icon={TrendingUp} label="No-show rate" value={`${operations.data.no_show_rate}%`} hint={`${operations.data.no_show_count} no-shows`} />
                <StatCard
                  icon={Activity}
                  label="Avg wait"
                  value={operations.data.avg_wait_minutes != null ? `${operations.data.avg_wait_minutes} min` : "—"}
                  hint={
                    operations.data.avg_service_minutes != null
                      ? `Avg service ${operations.data.avg_service_minutes} min`
                      : "Queue timing unavailable"
                  }
                />
              </div>

              <DetailSection title="Appointment funnel">
                <StatusBreakdown values={operations.data.appointments_by_status} emptyLabel="No appointments in period." />
              </DetailSection>

              <DetailSection title="Queue performance">
                <StatusBreakdown values={operations.data.queue_by_status} emptyLabel="No queue entries in period." />
                <p className="mt-3 text-sm">
                  <Link href="/queue" className="text-primary underline-offset-4 hover:underline">
                    Open queue board →
                  </Link>
                </p>
              </DetailSection>

              <DetailSection title="Peak appointment hours">
                <BarChart
                  entries={Object.entries(operations.data.peak_appointment_hours).map(([hour, count]) => ({
                    label: `${hour}:00`,
                    value: count,
                  }))}
                  emptyLabel="No hourly data for this period."
                />
              </DetailSection>
            </>
          ) : null}
        </TabsContent>

        <TabsContent value="clinical" className="space-y-8">
          {clinical.data ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard icon={Stethoscope} label="Encounters" value={String(clinical.data.encounter_count)} hint={`${clinical.data.encounters_completed} completed`} />
                <StatCard
                  icon={Activity}
                  label="Avg consult"
                  value={clinical.data.avg_consult_minutes != null ? `${clinical.data.avg_consult_minutes} min` : "—"}
                  hint="Completed encounters only"
                />
                <StatCard icon={ClipboardList} label="Prescriptions" value={String(clinical.data.prescription_count)} hint={`${clinical.data.prescription_items} line items`} />
                <StatCard
                  icon={TrendingUp}
                  label="Fill rate"
                  value={clinical.data.fill_rate_percent != null ? `${clinical.data.fill_rate_percent}%` : "—"}
                  hint={`${clinical.data.dispensed_quantity}/${clinical.data.prescribed_quantity} units`}
                />
              </div>

              <DetailSection title="Top diagnoses">
                {clinical.data.top_diagnoses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No diagnoses recorded in this period.</p>
                ) : (
                  <BreakdownTable
                    headers={["Code", "Description", "Count"]}
                    rows={clinical.data.top_diagnoses.map((row) => [row.code, row.description, String(row.count)])}
                  />
                )}
                <p className="mt-3 text-sm">
                  <Link href="/consultation" className="text-primary underline-offset-4 hover:underline">
                    Open consultations →
                  </Link>
                </p>
              </DetailSection>

              <DetailSection title="Follow-ups due">
                <DetailGrid>
                  <DetailField label="Next 7 days" value={clinical.data.follow_ups_due_7_days} />
                  <DetailField label="Next 30 days" value={clinical.data.follow_ups_due_30_days} />
                </DetailGrid>
              </DetailSection>
            </>
          ) : null}
        </TabsContent>

        <TabsContent value="pharmacy" className="space-y-8">
          {pharmacy.data ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard icon={Pill} label="Medicines tracked" value={String(pharmacy.data.medicines_tracked)} hint={`${pharmacy.data.total_units_on_hand} units on hand`} />
                <StatCard icon={Activity} label="Low stock" value={String(pharmacy.data.low_stock_count)} hint="At or below reorder level" />
                <StatCard icon={TrendingUp} label="Dispensed" value={String(pharmacy.data.movement_summary.dispense_units)} hint="Units in period" />
                <StatCard icon={Receipt} label="Expiring ≤30d" value={String(pharmacy.data.expiring_within_30_days)} hint="Units on hand" />
              </div>

              <DetailSection title="Low stock items">
                {pharmacy.data.low_stock_items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No low-stock medicines right now.</p>
                ) : (
                  <BreakdownTable
                    headers={["Medicine", "On hand", "Reorder level"]}
                    rows={pharmacy.data.low_stock_items.map((row) => [
                      `${row.medicine_code} · ${row.medicine_name}`,
                      String(row.quantity_on_hand),
                      String(row.reorder_level),
                    ])}
                  />
                )}
                <p className="mt-3 text-sm">
                  <Link href="/pharmacy" className="text-primary underline-offset-4 hover:underline">
                    Open pharmacy inventory →
                  </Link>
                </p>
              </DetailSection>

              <DetailSection title="Dispense volume">
                <BarChart
                  entries={pharmacy.data.dispense_by_medicine.map((row) => ({
                    label: row.code,
                    value: row.units,
                  }))}
                  emptyLabel="No dispense activity in period."
                />
              </DetailSection>
            </>
          ) : null}
        </TabsContent>

        <TabsContent value="laboratory" className="space-y-8">
          {laboratory.data ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard icon={FlaskConical} label="Lab orders" value={String(laboratory.data.order_count)} hint={`${laboratory.data.completed_orders} completed`} />
                <StatCard
                  icon={Activity}
                  label="Median TAT"
                  value={laboratory.data.median_turnaround_hours != null ? `${laboratory.data.median_turnaround_hours} h` : "—"}
                  hint="Ordered to reported"
                />
                <StatCard icon={ClipboardList} label="Results" value={String(laboratory.data.result_count)} hint="Recorded in period" />
                <StatCard
                  icon={TrendingUp}
                  label="Abnormal rate"
                  value={laboratory.data.abnormal_rate_percent != null ? `${laboratory.data.abnormal_rate_percent}%` : "—"}
                  hint={`${laboratory.data.abnormal_result_count} flagged results`}
                />
              </div>

              <DetailSection title="Order pipeline">
                <StatusBreakdown values={laboratory.data.orders_by_status} emptyLabel="No lab orders in period." />
                <p className="mt-3 text-sm">
                  <Link href="/laboratory" className="text-primary underline-offset-4 hover:underline">
                    Open laboratory →
                  </Link>
                </p>
              </DetailSection>

              <DetailSection title="Test volume">
                {laboratory.data.tests_by_volume.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No tests ordered in this period.</p>
                ) : (
                  <BreakdownTable
                    headers={["Test", "Orders"]}
                    rows={laboratory.data.tests_by_volume.map((row) => [`${row.code} · ${row.name}`, String(row.count)])}
                  />
                )}
              </DetailSection>
            </>
          ) : null}
        </TabsContent>
      </Tabs>
    </section>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card className="shadow-premium-sm">
      <CardContent className="flex items-start gap-4 p-5">
        <div className="rounded-xl bg-primary/10 p-3 text-primary">
          <Icon className="size-5" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tabular-nums">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function PaymentsByMethod({
  values,
  currency,
  locale,
}: {
  values: Record<string, string>;
  currency: string;
  locale?: string;
}) {
  const { resolvePaymentMethodName } = useBillingLookups();
  const entries = Object.entries(values);
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No payments recorded in this period.</p>;
  }
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map(([method, amount]) => (
        <div key={method} className="rounded-md border px-3 py-2 text-sm">
          <dt className="text-muted-foreground">{resolvePaymentMethodName(method, method)}</dt>
          <dd className="text-lg font-semibold tabular-nums">{formatMoney(currency, amount, locale)}</dd>
        </div>
      ))}
    </dl>
  );
}

function StatusBreakdown({ values, emptyLabel }: { values: Record<string, number>; emptyLabel: string }) {
  const entries = Object.entries(values);
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map(([status, count]) => (
        <div key={status} className="rounded-md border px-3 py-2 text-sm">
          <dt className="mb-1">
            <StatusText value={status} />
          </dt>
          <dd className="text-lg font-semibold">{count}</dd>
        </div>
      ))}
    </dl>
  );
}

function KeyValueGrid({
  values,
  currency,
  locale,
  emptyLabel,
}: {
  values: Record<string, string>;
  currency: string;
  locale?: string;
  emptyLabel: string;
}) {
  const entries = Object.entries(values);
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map(([kind, amount]) => (
        <div key={kind} className="rounded-md border px-3 py-2 text-sm">
          <dt className="mb-1">
            <StatusText value={kind} />
          </dt>
          <dd className="text-lg font-semibold tabular-nums">{formatMoney(currency, amount, locale)}</dd>
        </div>
      ))}
    </dl>
  );
}

function BreakdownTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-3 py-2 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-t">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-3 py-2">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BarChart({
  entries,
  emptyLabel,
}: {
  entries: Array<{ label: string; value: number }>;
  emptyLabel: string;
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  const max = Math.max(...entries.map((entry) => entry.value), 1);
  return (
    <div className="space-y-2">
      {entries.slice(0, 12).map((entry) => (
        <div key={entry.label} className="grid grid-cols-[4rem_1fr_2.5rem] items-center gap-2 text-sm">
          <span className="text-muted-foreground">{entry.label}</span>
          <div className="h-2 rounded-full bg-muted">
            <div className="h-2 rounded-full bg-primary" style={{ width: `${(entry.value / max) * 100}%` }} />
          </div>
          <span className="text-right tabular-nums">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

function TrendSection({
  data,
  currency,
  locale,
}: {
  data: ReportsTrends;
  currency: string;
  locale?: string;
}) {
  const maxPayments = Math.max(...data.series.map((point) => Number(point.payments_collected)), 1);
  return (
    <DetailSection title="Trends & period comparison">
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(["payments_collected", "issued_total", "appointments", "encounters"] as const).map((metric) => {
          const row = data.comparison[metric];
          if (!row) {
            return null;
          }
          const current =
            metric === "payments_collected" || metric === "issued_total"
              ? formatMoney(currency, String(row.current), locale)
              : String(row.current);
          return (
            <div key={metric} className="rounded-md border px-3 py-2 text-sm">
              <p className="text-muted-foreground">{metric.replace(/_/g, " ")}</p>
              <p className="text-lg font-semibold tabular-nums">{current}</p>
              <p
                className={cn(
                  "text-xs",
                  row.change_percent == null
                    ? "text-muted-foreground"
                    : row.change_percent >= 0
                      ? "text-success"
                      : "text-destructive",
                )}
              >
                {row.change_percent == null ? "No prior period data" : `${row.change_percent > 0 ? "+" : ""}${row.change_percent}% vs prior period`}
              </p>
            </div>
          );
        })}
      </div>
      <BarChart
        entries={data.series.map((point) => ({
          label: point.date.slice(5),
          value: Number(point.payments_collected),
        }))}
        emptyLabel="No trend data."
      />
      <p className="mt-2 text-xs text-muted-foreground">Daily payments collected ({maxPayments > 0 ? "scaled to max day" : "no activity"})</p>
    </DetailSection>
  );
}
