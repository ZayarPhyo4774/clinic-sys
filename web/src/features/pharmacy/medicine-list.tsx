"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { QueryState, describeError } from "@/components/query-state";
import { StatusText } from "@/components/record-browser";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { MedicineBulkImport } from "@/features/pharmacy/medicine-bulk-import";
import { useResourceList } from "@/hooks/use-resource-list";
import { withQuery } from "@/lib/api/client";
import type { Medicine, MedicineCategory } from "@/lib/api/types";

const ALL_CATEGORIES = "__all__";
const ALL_STATUS = "__all__";

function formatLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function MedicineList() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES);
  const [statusFilter, setStatusFilter] = useState(ALL_STATUS);

  const categoriesQuery = useResourceList<MedicineCategory>(
    "medicine-categories",
    withQuery("/medicine-categories/", { page_size: "100" }),
  );

  const medicinesQuery = useResourceList<Medicine>(
    "medicines",
    withQuery("/medicines/", { page_size: "500", ordering: "name" }),
  );

  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of categoriesQuery.data ?? []) {
      map.set(row.id, row.name);
    }
    return map;
  }, [categoriesQuery.data]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (medicinesQuery.data ?? []).filter((row) => {
      if (categoryFilter !== ALL_CATEGORIES && row.category !== categoryFilter) {
        return false;
      }
      if (statusFilter === "active" && !row.is_active) {
        return false;
      }
      if (statusFilter === "inactive" && row.is_active) {
        return false;
      }
      if (!needle) {
        return true;
      }
      const categoryName = categoryMap.get(row.category) ?? "";
      return (
        row.name.toLowerCase().includes(needle) ||
        row.code.toLowerCase().includes(needle) ||
        row.form.toLowerCase().includes(needle) ||
        row.strength.toLowerCase().includes(needle) ||
        categoryName.toLowerCase().includes(needle)
      );
    });
  }, [categoryFilter, categoryMap, medicinesQuery.data, search, statusFilter]);

  return (
    <div className="space-y-6">
      <MedicineBulkImport />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <Input
          placeholder="Search medicines by name, code, strength, or category…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="max-w-md"
        />
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="medicine_list_category">Category</Label>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger id="medicine_list_category" className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className="z-[100]">
                <SelectItem value={ALL_CATEGORIES}>All categories</SelectItem>
                {(categoriesQuery.data ?? []).map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="medicine_list_status">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger id="medicine_list_status" className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className="z-[100]">
                <SelectItem value={ALL_STATUS}>All statuses</SelectItem>
                <SelectItem value="active">Active only</SelectItem>
                <SelectItem value="inactive">Inactive only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="pb-2 text-sm text-muted-foreground">
            {filtered.length} of {medicinesQuery.data?.length ?? 0} medicines
          </p>
        </div>
      </div>

      {medicinesQuery.isLoading ? <QueryState status="loading" /> : null}
      {medicinesQuery.isError ? (
        <QueryState
          status="error"
          detail={describeError(medicinesQuery.error)}
          onRetry={() => void medicinesQuery.refetch()}
        />
      ) : null}

      {medicinesQuery.data ? (
        <div className="overflow-hidden rounded-xl border shadow-premium-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Medicine</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Form</TableHead>
                <TableHead>Strength</TableHead>
                <TableHead className="text-right">Reorder</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    No medicines match your filters.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Link href={`/pharmacy/${row.id}`} className="font-medium text-primary hover:underline">
                        {row.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{row.code}</p>
                    </TableCell>
                    <TableCell>{categoryMap.get(row.category) ?? "—"}</TableCell>
                    <TableCell>{formatLabel(row.form)}</TableCell>
                    <TableCell>
                      {row.strength} {row.unit}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{row.reorder_level}</TableCell>
                    <TableCell>
                      {row.is_active ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <StatusText value="inactive" />
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}
