"use client";

import { CalendarClock } from "lucide-react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { QueryState, describeError } from "@/components/query-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import {
  formatStockDirection,
  formatStockKind,
  formatStockReason,
} from "@/features/pharmacy/stock-labels";
import { useResourceList } from "@/hooks/use-resource-list";
import { api, withQuery } from "@/lib/api/client";
import type { Medicine, Page, StockTransaction } from "@/lib/api/types";
import { formatWhen } from "@/lib/utils";

const ALL_KINDS = "__all__";
const ALL_MEDICINES = "__all__";
const PAGE_SIZE = 50;

const kindOptions = [
  { value: ALL_KINDS, label: "All movements" },
  { value: "stock_in", label: "Stock in" },
  { value: "adjustment", label: "Adjustment" },
  { value: "dispense", label: "Dispense" },
];

function useMedicineNameLookup() {
  const medicinesQuery = useResourceList<Medicine>(
    "medicines",
    withQuery("/medicines/", { page_size: "500" }),
  );

  const lookup = useMemo(() => {
    const byId = new Map<string, string>();
    const byCode = new Map<string, string>();
    for (const medicine of medicinesQuery.data ?? []) {
      byId.set(medicine.id, medicine.name);
      byCode.set(medicine.code, medicine.name);
    }
    return { byId, byCode };
  }, [medicinesQuery.data]);

  function resolveMedicineName(row: Pick<StockTransaction, "medicine" | "medicine_name">) {
    const fromCatalog = lookup.byId.get(row.medicine) ?? lookup.byCode.get(row.medicine);
    if (fromCatalog) {
      return fromCatalog;
    }
    if (row.medicine_name) {
      const fromApiCode = lookup.byCode.get(row.medicine_name);
      if (fromApiCode) {
        return fromApiCode;
      }
      return row.medicine_name;
    }
    return "Unknown medicine";
  }

  function resolveMedicineId(row: Pick<StockTransaction, "medicine">) {
    if (lookup.byId.has(row.medicine)) {
      return row.medicine;
    }
    const match = medicinesQuery.data?.find((medicine) => medicine.code === row.medicine);
    return match?.id ?? row.medicine;
  }

  return {
    resolveMedicineName,
    resolveMedicineId,
    isLoading: medicinesQuery.isLoading,
    medicines: medicinesQuery.data ?? [],
  };
}

function DirectionBadge({ direction, kind }: { direction: string; kind: string }) {
  if (kind === "stock_in" || direction === "in") {
    return <Badge variant="success">In</Badge>;
  }
  if (direction === "out") {
    return <Badge variant="destructive">Out</Badge>;
  }
  return <span className="text-muted-foreground">—</span>;
}

export function InventoryLedger({ medicineId }: { medicineId?: string } = {}) {
  const [kindFilter, setKindFilter] = useState(ALL_KINDS);
  const [medicineFilter, setMedicineFilter] = useState(medicineId ?? ALL_MEDICINES);
  const [page, setPage] = useState(1);

  const effectiveMedicine = medicineId ?? (medicineFilter === ALL_MEDICINES ? undefined : medicineFilter);

  const { resolveMedicineName, resolveMedicineId, isLoading: medicinesLoading, medicines } =
    useMedicineNameLookup();

  const ledgerQuery = useQuery({
    queryKey: ["stock-transactions", "ledger", kindFilter, effectiveMedicine, page],
    queryFn: () =>
      api<Page<StockTransaction>>(
        withQuery("/stock-transactions/", {
          page: String(page),
          page_size: String(PAGE_SIZE),
          kind: kindFilter === ALL_KINDS ? undefined : kindFilter,
          medicine: effectiveMedicine,
        }),
      ),
  });

  const rows = ledgerQuery.data?.results ?? [];
  const totalCount = ledgerQuery.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const summary = useMemo(() => {
    const stockIn = rows.filter((row) => row.kind === "stock_in").length;
    const adjustments = rows.filter((row) => row.kind === "adjustment").length;
    const dispenses = rows.filter((row) => row.kind === "dispense").length;
    return { stockIn, adjustments, dispenses };
  }, [rows]);

  function resetPage() {
    setPage(1);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="ledger_kind_filter">Movement type</Label>
            <Select
              value={kindFilter}
              onValueChange={(value) => {
                setKindFilter(value);
                resetPage();
              }}
            >
              <SelectTrigger id="ledger_kind_filter" className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className="z-[100]">
                {kindOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!medicineId ? (
            <div className="space-y-2">
              <Label htmlFor="ledger_medicine_filter">Medicine</Label>
              <Select
                value={medicineFilter}
                onValueChange={(value) => {
                  setMedicineFilter(value);
                  resetPage();
                }}
                disabled={medicinesLoading}
              >
                <SelectTrigger id="ledger_medicine_filter" className="w-[220px]">
                  <SelectValue placeholder={medicinesLoading ? "Loading…" : "All medicines"} />
                </SelectTrigger>
                <SelectContent position="popper" className="z-[100]">
                  <SelectItem value={ALL_MEDICINES}>All medicines</SelectItem>
                  {medicines.map((medicine) => (
                    <SelectItem key={medicine.id} value={medicine.id}>
                      {medicine.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {totalCount.toLocaleString()} movement{totalCount === 1 ? "" : "s"}
          {rows.length ? (
            <>
              {" "}
              · {summary.stockIn} stock in · {summary.adjustments} adjustments · {summary.dispenses} dispenses on
              this page
            </>
          ) : null}
        </p>
      </div>

      {ledgerQuery.isLoading ? <QueryState status="loading" /> : null}
      {ledgerQuery.isError ? (
        <QueryState
          status="error"
          detail={describeError(ledgerQuery.error)}
          onRetry={() => void ledgerQuery.refetch()}
        />
      ) : null}

      {ledgerQuery.data ? (
        <>
          <div className="overflow-hidden rounded-xl border shadow-premium-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  {!medicineId ? <TableHead>Medicine</TableHead> : null}
                  <TableHead>Batch</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={medicineId ? 7 : 8}
                      className="py-10 text-center text-muted-foreground"
                    >
                      No stock movements match your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <span className="inline-flex items-center gap-2 whitespace-nowrap">
                          <CalendarClock className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                          {formatWhen(row.recorded_at)}
                        </span>
                      </TableCell>
                      {!medicineId ? (
                        <TableCell>
                          <Link
                            href={`/pharmacy/${resolveMedicineId(row)}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {resolveMedicineName(row)}
                          </Link>
                        </TableCell>
                      ) : null}
                      <TableCell className="font-mono text-sm">{row.batch_number ?? "—"}</TableCell>
                      <TableCell>{formatStockKind(row.kind)}</TableCell>
                      <TableCell>
                        <DirectionBadge direction={row.direction} kind={row.kind} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{row.quantity}</TableCell>
                      <TableCell>{formatStockReason(row.reason)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {row.quantity_on_hand ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || ledgerQuery.isFetching}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || ledgerQuery.isFetching}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
