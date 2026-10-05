"use client";

import { Activity, Download, Pill, Receipt, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { QueryState, describeError } from "@/components/query-state";
import { StatusText } from "@/components/record-browser";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DetailSection } from "@/components/detail-fields";
import { downloadReportCsv, formatRangeLabel, type ReportRange, rangeQueryParams } from "@/features/reports/report-utils";
import { useAuth } from "@/features/auth/auth-provider";
import { api, withQuery } from "@/lib/api/client";
import type { PharmacyReport } from "@/lib/api/types";

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Pill;
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

function stockStatusLabel(status: string) {
  if (status === "out_of_stock") {
    return <span className="text-destructive">Out of stock</span>;
  }
  if (status === "low_stock") {
    return <span className="text-warning-foreground">Low stock</span>;
  }
  return <span className="text-muted-foreground">In stock</span>;
}

function MovementBar({ label, value, max }: { label: string; value: number; max: number }) {
  const width = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums font-medium">{value.toLocaleString()}</span>
      </div>
      <div className="h-2 rounded-full bg-muted">
        <div className="h-2 rounded-full bg-primary" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export function PharmacyReportPanel({ range }: { range: ReportRange }) {
  const { branchId } = useAuth();
  const [exporting, setExporting] = useState(false);
  const queryParams = rangeQueryParams(range);

  const query = useQuery({
    queryKey: ["reports", "pharmacy", range, branchId],
    queryFn: () => api<PharmacyReport>(withQuery("/reports/pharmacy/", queryParams)),
  });

  async function handleExport() {
    setExporting(true);
    try {
      await downloadReportCsv("pharmacy", queryParams);
      toast.success("Pharmacy report CSV downloaded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  if (query.isLoading) {
    return <QueryState status="loading" />;
  }
  if (query.isError) {
    return (
      <QueryState status="error" detail={describeError(query.error)} onRetry={() => void query.refetch()} />
    );
  }

  const report = query.data;
  if (!report) {
    return <QueryState status="empty" detail="No pharmacy report data for this period." />;
  }

  const movement = report.movement_summary;
  const totals = report.ledger_totals;
  const movementMax = Math.max(
    movement.stock_in_units,
    movement.used_units,
    movement.adjustment_out_units,
    movement.transfer_out_units,
    1,
  );
  const inStock = report.inventory_ledger.filter((row) => row.remaining_balance > 0).length;
  const outOfStock = report.inventory_ledger.length - inStock;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Inventory ledger for {formatRangeLabel(range.from, range.to)}
          {branchId ? " at the selected branch" : " across all branches"}. Opening stock, quantity used, and
          remaining balance.
        </p>
        <Button type="button" variant="outline" size="sm" disabled={exporting} onClick={() => void handleExport()}>
          <Download className="mr-2 size-4" aria-hidden="true" />
          {exporting ? "Exporting…" : "Download CSV"}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Pill}
          label="Remaining balance"
          value={report.total_units_on_hand.toLocaleString()}
          hint={`${report.medicines_tracked} medicines · balance at period end`}
        />
        <StatCard
          icon={Activity}
          label="Low or out of stock"
          value={String(report.low_stock_count)}
          hint="Remaining balance at or below reorder"
        />
        <StatCard
          icon={TrendingUp}
          label="Used"
          value={String(movement.used_units)}
          hint={`${movement.stock_in_units.toLocaleString()} received in period`}
        />
        <StatCard
          icon={Receipt}
          label="Expiring ≤30d"
          value={String(report.expiring_within_30_days)}
          hint={`${report.expiring_within_60_days} in 31–60d · ${report.expiring_within_90_days} in 61–90d`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="shadow-premium-sm">
          <CardHeader>
            <CardTitle className="text-base">Stock movement</CardTitle>
            <CardDescription>
              Opening {totals.opening_balance.toLocaleString()} + received − used + adjustments and transfers = remaining{" "}
              {totals.remaining_balance.toLocaleString()}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <MovementBar label="Received" value={movement.stock_in_units} max={movementMax} />
            <MovementBar label="Used" value={movement.used_units} max={movementMax} />
            <MovementBar label="Written off" value={movement.adjustment_out_units} max={movementMax} />
            <MovementBar label="Transferred out" value={movement.transfer_out_units} max={movementMax} />
          </CardContent>
        </Card>

        <Card className="shadow-premium-sm">
          <CardHeader>
            <CardTitle className="text-base">Store vs clinic inventory</CardTitle>
            <CardDescription>Current on-hand stock by branch role.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            {Object.entries(report.inventory_by_role).map(([role, row]) => (
              <div key={role} className="rounded-lg border px-4 py-3">
                <p className="text-sm font-medium">{row.label}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">{row.units_on_hand.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{row.batch_count} batches</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <DetailSection title="Inventory ledger">
        <p className="mb-4 text-sm text-muted-foreground">
          Stock position for the selected period. Remaining balance is opening stock plus receipts, minus what was
          dispensed, written off, or transferred out.
        </p>
        <div className="overflow-x-auto rounded-xl border shadow-premium-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Medicine</TableHead>
                <TableHead className="text-right">Opening</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Used</TableHead>
                <TableHead className="text-right">Adj. in</TableHead>
                <TableHead className="text-right">Adj. out</TableHead>
                <TableHead className="text-right">Transfer in</TableHead>
                <TableHead className="text-right">Transfer out</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.inventory_ledger.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                    No medicines in the clinic catalog.
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {report.inventory_ledger.map((row) => (
                    <TableRow key={row.medicine_id}>
                      <TableCell>
                        <Link href={`/pharmacy/${row.medicine_id}`} className="font-medium text-primary hover:underline">
                          {row.medicine_name}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {row.medicine_code} · {row.strength} · {row.unit}
                        </p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.opening_balance}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.received}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.used}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.adjustment_in}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.adjustment_out}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.transfer_in}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.transfer_out}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{row.remaining_balance}</TableCell>
                      <TableCell>{stockStatusLabel(row.status)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell className="font-medium">Total</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{totals.opening_balance}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{totals.received}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{totals.used}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{totals.adjustment_in}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{totals.adjustment_out}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{totals.transfer_in}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{totals.transfer_out}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{totals.remaining_balance}</TableCell>
                    <TableCell />
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {inStock} with remaining stock · {outOfStock} at zero
        </p>
      </DetailSection>

      <div className="grid gap-6 lg:grid-cols-2">
        <DetailSection title="Low stock medicines">
          {report.low_stock_items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No medicines are low or out of stock at the end of this period.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Medicine</th>
                    <th className="px-3 py-2 font-medium text-right">Remaining</th>
                    <th className="px-3 py-2 font-medium text-right">Used</th>
                    <th className="px-3 py-2 font-medium text-right">Reorder</th>
                  </tr>
                </thead>
                <tbody>
                  {report.low_stock_items.map((row) => (
                    <tr key={row.medicine_id} className="border-t">
                      <td className="px-3 py-2">
                        {row.medicine_code} · {row.medicine_name}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.quantity_on_hand}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.used ?? 0}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.reorder_level}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DetailSection>

        <DetailSection title="Used in period">
          {report.dispense_by_medicine.length === 0 ? (
            <p className="text-sm text-muted-foreground">No medicine was used in this period.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Medicine</th>
                    <th className="px-3 py-2 font-medium text-right">Units</th>
                  </tr>
                </thead>
                <tbody>
                  {report.dispense_by_medicine.map((row) => (
                    <tr key={row.medicine_id} className="border-t">
                      <td className="px-3 py-2">
                        {row.code} · {row.name}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.units}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DetailSection>
      </div>

      {Object.keys(report.adjustments_by_reason).length > 0 ? (
        <DetailSection title="Adjustments by reason">
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(report.adjustments_by_reason).map(([reason, count]) => (
              <div key={reason} className="rounded-md border px-3 py-2 text-sm">
                <dt className="mb-1">
                  <StatusText value={reason} />
                </dt>
                <dd className="text-lg font-semibold tabular-nums">{count}</dd>
              </div>
            ))}
          </dl>
        </DetailSection>
      ) : null}

      <DetailSection title="Stock movements">
        <p className="mb-4 text-sm text-muted-foreground">
          Every receipt, dispense, adjustment, and transfer in the selected period. Signed quantity increases or
          decreases the remaining balance.
        </p>
        <div className="overflow-x-auto rounded-xl border shadow-premium-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Medicine</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Movement</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Signed</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.movement_lines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    No stock movements in this period.
                  </TableCell>
                </TableRow>
              ) : (
                report.movement_lines.map((line, index) => (
                  <TableRow key={`${line.recorded_at}-${line.batch_number}-${index}`}>
                    <TableCell className="whitespace-nowrap">{line.recorded_at.replace("T", " ").slice(0, 16)}</TableCell>
                    <TableCell>
                      {line.medicine_name}
                      <p className="text-xs text-muted-foreground">{line.medicine_code}</p>
                    </TableCell>
                    <TableCell>{line.batch_number}</TableCell>
                    <TableCell>{line.kind_label}</TableCell>
                    <TableCell className="text-right tabular-nums">{line.quantity}</TableCell>
                    <TableCell className="text-right tabular-nums">{line.signed_quantity}</TableCell>
                    <TableCell>{line.reason || "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </DetailSection>

      <DetailSection title="Batch register">
        <p className="mb-4 text-sm text-muted-foreground">
          Active batches with stock on hand, grouped by branch and expiry.
        </p>
        <div className="overflow-x-auto rounded-xl border shadow-premium-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch</TableHead>
                <TableHead>Medicine</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead>Supplier</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.batch_register.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    No batches with stock on hand.
                  </TableCell>
                </TableRow>
              ) : (
                report.batch_register.map((row) => (
                  <TableRow key={row.batch_id}>
                    <TableCell>{row.batch_number}</TableCell>
                    <TableCell>
                      {row.medicine_name}
                      <p className="text-xs text-muted-foreground">{row.medicine_code}</p>
                    </TableCell>
                    <TableCell>{row.branch_name}</TableCell>
                    <TableCell>{row.branch_role}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.quantity_on_hand}</TableCell>
                    <TableCell>{row.expiry_date}</TableCell>
                    <TableCell>{row.supplier_name || "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </DetailSection>

      <p className="text-sm">
        <Link href="/pharmacy" className="text-primary underline-offset-4 hover:underline">
          Open pharmacy inventory →
        </Link>
      </p>
    </div>
  );
}
