"use client";

import { AlertTriangle, ArrowLeftRight, ClipboardList, Layers, Package, Pill, Truck } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { allowed } from "@/features/access/navigation";
import { RequirePermission } from "@/features/access/require-permission";
import { useAuth } from "@/features/auth/auth-provider";
import { ToggleActiveButton } from "@/features/organization/org-writes";
import { InventoryLedger } from "@/features/pharmacy/inventory-ledger";
import { MedicineList } from "@/features/pharmacy/medicine-list";
import { PharmacyInventoryReportPanel } from "@/features/pharmacy/pharmacy-inventory-report";
import { PharmacyStockMovement } from "@/features/pharmacy/pharmacy-stock-movement";
import {
  CreateCategoryForm,
  CreateMedicineForm,
  CreateSupplierForm,
  EditCatalogNameForm,
} from "@/features/pharmacy/pharmacy-writes";
import { useResourceList } from "@/hooks/use-resource-list";
import { api, withQuery } from "@/lib/api/client";
import type { Medicine, MedicineCategory, Page, Supplier } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const ALL_CATEGORIES = "__all__";
const ALL_STOCK = "__all__";

function formatLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function isLowStock(medicine: Medicine) {
  return medicine.available_quantity <= medicine.reorder_level;
}

function StockBadge({ medicine }: { medicine: Medicine }) {
  if (!medicine.is_active) {
    return <StatusText value="inactive" />;
  }
  if (medicine.available_quantity === 0) {
    return <Badge variant="destructive">Out of stock</Badge>;
  }
  if (isLowStock(medicine)) {
    return <Badge variant="warning">Low stock</Badge>;
  }
  return <Badge variant="success">In stock</Badge>;
}

function CatalogTable<T extends { id: string; name: string; code: string; is_active: boolean }>({
  rows,
  isLoading,
  error,
  onRetry,
  label,
  resource,
  pathPrefix,
}: {
  rows: T[] | undefined;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  label: string;
  resource: string;
  pathPrefix: string;
}) {
  if (isLoading) {
    return <QueryState status="loading" />;
  }
  if (error) {
    return <QueryState status="error" detail={describeError(error)} onRetry={onRetry} />;
  }
  if (!rows?.length) {
    return <p className="text-sm text-muted-foreground">No {label.toLowerCase()} yet.</p>;
  }
  return (
    <div className="overflow-hidden rounded-xl border shadow-premium-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Code</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[120px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium">{row.name}</TableCell>
              <TableCell>
                <Badge variant="outline">{row.code}</Badge>
              </TableCell>
              <TableCell>
                <StatusText value={row.is_active ? "active" : "inactive"} />
              </TableCell>
              <TableCell>
                <ToggleActiveButton
                  path={`${pathPrefix}${row.id}/`}
                  active={row.is_active}
                  resource={resource}
                  label={label}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function PharmacyCatalogSetup() {
  const categories = useResourceList<MedicineCategory>(
    "medicine-categories",
    withQuery("/medicine-categories/", { page_size: "100" }),
  );
  const suppliers = useResourceList<Supplier>("suppliers", withQuery("/suppliers/", { page_size: "100" }));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="shadow-premium-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="size-5 text-primary" aria-hidden="true" />
            Categories
          </CardTitle>
          <CardDescription>Group medicines for filters, reporting, and catalog organization.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CreateCategoryForm />
          <EditCatalogNameForm
            label="Category"
            resource="medicine-categories"
            pathPrefix="/medicine-categories/"
            items={categories.data}
          />
          <CatalogTable
            rows={categories.data}
            isLoading={categories.isLoading}
            error={categories.error}
            onRetry={() => void categories.refetch()}
            label="Category"
            resource="medicine-categories"
            pathPrefix="/medicine-categories/"
          />
        </CardContent>
      </Card>
      <Card className="shadow-premium-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="size-5 text-primary" aria-hidden="true" />
            Suppliers
          </CardTitle>
          <CardDescription>Vendors referenced when receiving new stock batches.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CreateSupplierForm />
          <EditCatalogNameForm
            label="Supplier"
            resource="suppliers"
            pathPrefix="/suppliers/"
            items={suppliers.data}
          />
          <CatalogTable
            rows={suppliers.data}
            isLoading={suppliers.isLoading}
            error={suppliers.error}
            onRetry={() => void suppliers.refetch()}
            label="Supplier"
            resource="suppliers"
            pathPrefix="/suppliers/"
          />
        </CardContent>
      </Card>
    </div>
  );
}

function PharmacyInventory() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES);
  const [stockFilter, setStockFilter] = useState(ALL_STOCK);

  const categoriesQuery = useResourceList<MedicineCategory>(
    "medicine-categories",
    withQuery("/medicine-categories/", { page_size: "100" }),
  );

  const medicinesQuery = useQuery({
    queryKey: ["medicines", "inventory", stockFilter],
    queryFn: async () => {
      const page = await api<Page<Medicine>>(
        withQuery("/medicines/", {
          page_size: "200",
          low_stock: stockFilter === "low" ? "true" : undefined,
        }),
      );
      return page.results;
    },
  });

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
      if (!needle) {
        return true;
      }
      const categoryName = categoryMap.get(row.category) ?? "";
      return (
        row.name.toLowerCase().includes(needle) ||
        row.code.toLowerCase().includes(needle) ||
        row.form.toLowerCase().includes(needle) ||
        categoryName.toLowerCase().includes(needle)
      );
    });
  }, [categoryFilter, categoryMap, medicinesQuery.data, search]);

  const medicines = medicinesQuery.data ?? [];
  const lowStockCount = medicines.filter((row) => row.is_active && isLowStock(row)).length;
  const outOfStockCount = medicines.filter((row) => row.is_active && row.available_quantity === 0).length;
  const totalUnits = medicines.reduce((sum, row) => sum + row.available_quantity, 0);

  return (
    <div className="space-y-4">
      {lowStockCount > 0 ? (
        <div
          className={cn(
            "flex items-start gap-3 rounded-xl border px-4 py-3 shadow-premium-sm",
            outOfStockCount > 0 ? "border-destructive/30 bg-destructive/5" : "border-warning/30 bg-warning/5",
          )}
          role="alert"
        >
          <AlertTriangle
            className={cn(
              "mt-0.5 size-5 shrink-0",
              outOfStockCount > 0 ? "text-destructive" : "text-warning-foreground",
            )}
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-semibold">
              {outOfStockCount > 0 ? "Stock attention needed" : "Low stock items"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {lowStockCount} medicine{lowStockCount === 1 ? "" : "s"} at or below reorder level
              {outOfStockCount > 0 ? ` · ${outOfStockCount} out of stock` : ""}. Open a medicine to receive stock.
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <Input
          placeholder="Search medicines by name, code, or category…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="max-w-md"
        />
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="pharmacy_category_filter">Category</Label>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger id="pharmacy_category_filter" className="w-[180px]">
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
            <Label htmlFor="pharmacy_stock_filter">Stock</Label>
            <Select value={stockFilter} onValueChange={setStockFilter}>
              <SelectTrigger id="pharmacy_stock_filter" className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className="z-[100]">
                <SelectItem value={ALL_STOCK}>All medicines</SelectItem>
                <SelectItem value="low">Low stock only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="pb-2 text-sm text-muted-foreground">
            {filtered.length} shown · {totalUnits.toLocaleString()} units on hand
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
                <TableHead className="text-right">Available</TableHead>
                <TableHead className="text-right">Reorder</TableHead>
                <TableHead>Stock</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    No medicines match your filters.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row) => (
                  <TableRow key={row.id} className="group">
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
                    <TableCell className="text-right tabular-nums font-medium">{row.available_quantity}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{row.reorder_level}</TableCell>
                    <TableCell>
                      <StockBadge medicine={row} />
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

function PharmacyWorkspace() {
  const { account } = useAuth();
  const canManage = Boolean(account && allowed(account.permissions, "pharmacy.manage"));
  const [tab, setTab] = useState("medicines");

  const medicinesQuery = useQuery({
    queryKey: ["medicines", "stats"],
    queryFn: async () => {
      const page = await api<Page<Medicine>>(withQuery("/medicines/", { page_size: "200" }));
      return page.results;
    },
  });

  const categoriesQuery = useResourceList<MedicineCategory>(
    "medicine-categories",
    withQuery("/medicine-categories/", { page_size: "100" }),
  );

  const medicines = medicinesQuery.data ?? [];
  const lowStockCount = medicines.filter((row) => row.is_active && isLowStock(row)).length;
  const totalUnits = medicines.reduce((sum, row) => sum + row.available_quantity, 0);
  const activeCount = medicines.filter((row) => row.is_active).length;

  return (
    <section className="space-y-8">
      <PageHeader
        eyebrow="Operations"
        title="Pharmacy"
        description="Medicine catalog, stock in/out, adjustments, and inventory ledger. Dispense from prescriptions after a doctor writes an order."
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/prescriptions">Prescriptions</Link>
            </Button>
            {canManage ? (
              <>
                <Button type="button" variant="outline" onClick={() => setTab("stock")}>
                  Stock movement
                </Button>
                <Button type="button" onClick={() => setTab("add")}>
                  Add medicine
                </Button>
              </>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="shadow-premium-sm">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-xl bg-primary/10 p-3 text-primary">
              <Pill className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">{medicines.length}</p>
              <p className="text-sm text-muted-foreground">{activeCount} active medicines</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-premium-sm">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-xl bg-warning/15 p-3 text-warning-foreground">
              <AlertTriangle className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">{lowStockCount}</p>
              <p className="text-sm text-muted-foreground">Low stock alerts</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-premium-sm">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-xl bg-primary/10 p-3 text-primary">
              <Package className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">{totalUnits.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground">Units on hand</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-premium-sm">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-xl bg-primary/10 p-3 text-primary">
              <Layers className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">{categoriesQuery.data?.length ?? 0}</p>
              <p className="text-sm text-muted-foreground">Categories</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="medicines">Medicine list</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="ledger">Inventory ledger</TabsTrigger>
          {canManage ? <TabsTrigger value="stock">Stock movement</TabsTrigger> : null}
          <TabsTrigger value="inventory-report">Inventory report</TabsTrigger>
          {canManage ? <TabsTrigger value="catalog">Catalog setup</TabsTrigger> : null}
          {canManage ? <TabsTrigger value="add">Add medicine</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="medicines" className="mt-6">
          <MedicineList />
        </TabsContent>

        <TabsContent value="inventory" className="mt-6">
          <PharmacyInventory />
        </TabsContent>

        <TabsContent value="ledger" className="mt-6 space-y-4">
          <div className="flex items-start gap-3 rounded-xl border bg-muted/30 px-4 py-3 shadow-premium-sm">
            <ClipboardList className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold">Branch inventory ledger</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Every stock in, adjustment, and prescription dispense is recorded here with batch balance after each
                movement.
              </p>
            </div>
          </div>
          <InventoryLedger />
        </TabsContent>

        <TabsContent value="inventory-report" className="mt-6">
          <PharmacyInventoryReportPanel />
        </TabsContent>

        {canManage ? (
          <TabsContent value="stock" className="mt-6 space-y-4">
            <div className="flex items-start gap-3 rounded-xl border bg-muted/30 px-4 py-3 shadow-premium-sm">
              <ArrowLeftRight className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold">Record stock movements</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Select a medicine to receive batches, add stock, remove stock, or post inventory adjustments.
                </p>
              </div>
            </div>
            <PharmacyStockMovement />
          </TabsContent>
        ) : null}

        {canManage ? (
          <TabsContent value="catalog" className="mt-6">
            <PharmacyCatalogSetup />
          </TabsContent>
        ) : null}

        {canManage ? (
          <TabsContent value="add" className="mt-6">
            <CreateMedicineForm />
          </TabsContent>
        ) : null}
      </Tabs>
    </section>
  );
}

export function PharmacyScreen() {
  return (
    <RequirePermission permission="pharmacy.view" title="Pharmacy">
      <PharmacyWorkspace />
    </RequirePermission>
  );
}
