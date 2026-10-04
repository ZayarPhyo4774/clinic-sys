"use client";

import { AlertTriangle, Package } from "lucide-react";
import { useMemo, useState } from "react";

import { StatusText } from "@/components/record-browser";
import { DetailField, DetailGrid, DetailSection, DetailTable } from "@/components/detail-fields";
import { DetailLayout } from "@/components/detail-layout";
import { DetailPageState } from "@/components/detail-page-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { allowed } from "@/features/access/navigation";
import { RequirePermission } from "@/features/access/require-permission";
import { useAuth } from "@/features/auth/auth-provider";
import { InventoryLedger } from "@/features/pharmacy/inventory-ledger";
import {
  BatchActiveToggle,
  EditMedicineForm,
  ReceiveStockForm,
  StockOperationsPanel,
} from "@/features/pharmacy/pharmacy-writes";
import { useDetailQuery, useRelatedListQuery } from "@/hooks/use-detail-query";
import { useResourceList } from "@/hooks/use-resource-list";
import { withQuery } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { Medicine, MedicineBatch, MedicineCategory } from "@/lib/api/types";

function formatLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function daysUntil(dateValue: string) {
  const expiry = new Date(dateValue);
  if (Number.isNaN(expiry.getTime())) {
    return null;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);
  return Math.ceil((expiry.getTime() - today.getTime()) / 86_400_000);
}

function ExpiryBadge({ expiryDate }: { expiryDate: string }) {
  const days = daysUntil(expiryDate);
  if (days === null) {
    return <span>{expiryDate}</span>;
  }
  if (days < 0) {
    return (
      <span className="inline-flex items-center gap-2">
        {expiryDate}
        <Badge variant="destructive">Expired</Badge>
      </span>
    );
  }
  if (days <= 30) {
    return (
      <span className="inline-flex items-center gap-2">
        {expiryDate}
        <Badge variant="warning">{days}d left</Badge>
      </span>
    );
  }
  return <span>{expiryDate}</span>;
}

function MedicineSummary({ medicine, categoryName }: { medicine: Medicine; categoryName: string }) {
  const lowStock = medicine.available_quantity <= medicine.reorder_level;

  return (
    <div className="space-y-4">
      {lowStock && medicine.is_active ? (
        <div
          className={cn(
            "flex items-start gap-3 rounded-xl border px-4 py-3 shadow-premium-sm",
            medicine.available_quantity === 0
              ? "border-destructive/30 bg-destructive/5"
              : "border-warning/30 bg-warning/5",
          )}
          role="alert"
        >
          <AlertTriangle
            className={cn(
              "mt-0.5 size-5 shrink-0",
              medicine.available_quantity === 0 ? "text-destructive" : "text-warning-foreground",
            )}
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-semibold">
              {medicine.available_quantity === 0 ? "Out of stock" : "Below reorder level"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Available {medicine.available_quantity} · Reorder at {medicine.reorder_level}. Receive stock on the
              Batches tab.
            </p>
          </div>
        </div>
      ) : null}

      <Card className="shadow-premium-sm">
        <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusText value={medicine.is_active ? "active" : "inactive"} />
              <Badge variant="outline">{medicine.code}</Badge>
              {categoryName ? <Badge variant="info">{categoryName}</Badge> : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {formatLabel(medicine.form)} · {medicine.strength} {medicine.unit}
            </p>
          </div>
          <div className="flex items-center gap-4 rounded-xl border bg-muted/30 px-5 py-4">
            <div className="rounded-xl bg-primary/10 p-3 text-primary">
              <Package className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-3xl font-bold tabular-nums">{medicine.available_quantity}</p>
              <p className="text-sm text-muted-foreground">Units available</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function MedicineDetailScreen({ medicineId }: { medicineId: string }) {
  return (
    <RequirePermission permission="pharmacy.view" title="Medicine">
      <MedicineDetail medicineId={medicineId} />
    </RequirePermission>
  );
}

function MedicineDetail({ medicineId }: { medicineId: string }) {
  const { account } = useAuth();
  const canManage = Boolean(account && allowed(account.permissions, "pharmacy.manage"));
  const [tab, setTab] = useState("overview");

  const query = useDetailQuery<Medicine>("medicines", `/medicines/${medicineId}/`);
  const categoriesQuery = useResourceList<MedicineCategory>(
    "medicine-categories",
    withQuery("/medicine-categories/", { page_size: "100" }),
  );
  const batchesQuery = useRelatedListQuery<MedicineBatch>(
    "medicine-batches",
    withQuery("/medicine-batches/", { medicine: medicineId }),
  );
  const categoryName = useMemo(() => {
    if (!query.data) {
      return "";
    }
    return categoriesQuery.data?.find((row) => row.id === query.data?.category)?.name ?? "";
  }, [categoriesQuery.data, query.data]);

  const batchStats = useMemo(() => {
    const batches = batchesQuery.data ?? [];
    const activeBatches = batches.filter((row) => row.is_active);
    const onHand = activeBatches.reduce((sum, row) => sum + Number(row.quantity_on_hand), 0);
    const expiringSoon = activeBatches.filter((row) => {
      const days = daysUntil(String(row.expiry_date));
      return days !== null && days >= 0 && days <= 30;
    }).length;
    return { activeBatches: activeBatches.length, onHand, expiringSoon };
  }, [batchesQuery.data]);

  const state = (
    <DetailPageState
      title="Medicine"
      isLoading={query.isLoading}
      error={query.error}
      onRetry={() => void query.refetch()}
    />
  );

  if (query.isLoading || query.error || !query.data) {
    return state;
  }

  const medicine = query.data;
  const lowStock = medicine.available_quantity <= medicine.reorder_level;

  return (
    <DetailLayout
      breadcrumbs={[
        { label: "Dashboard", href: "/" },
        { label: "Pharmacy", href: "/pharmacy" },
        { label: medicine.name },
      ]}
      title={medicine.name}
      description={`${medicine.code} · ${formatLabel(medicine.form)} · ${medicine.strength} ${medicine.unit}`}
    >
      <MedicineSummary medicine={medicine} categoryName={categoryName} />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="batches">Batches ({batchStats.activeBatches})</TabsTrigger>
          <TabsTrigger value="history">Inventory ledger</TabsTrigger>
          {canManage ? <TabsTrigger value="manage">Manage</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6">
          <DetailSection title="Catalog details">
            <DetailGrid>
              <DetailField label="Code" value={medicine.code} />
              <DetailField label="Category" value={categoryName || "—"} />
              <DetailField label="Form" value={formatLabel(medicine.form)} />
              <DetailField label="Strength" value={`${medicine.strength} ${medicine.unit}`} />
              <DetailField label="Available" value={medicine.available_quantity} />
              <DetailField label="Reorder level" value={medicine.reorder_level} />
              <DetailField
                label="Stock status"
                value={
                  !medicine.is_active ? (
                    <StatusText value="inactive" />
                  ) : medicine.available_quantity === 0 ? (
                    <Badge variant="destructive">Out of stock</Badge>
                  ) : lowStock ? (
                    <Badge variant="warning">Low stock</Badge>
                  ) : (
                    <Badge variant="success">In stock</Badge>
                  )
                }
              />
              <DetailField label="Active batches" value={batchStats.activeBatches} />
              <DetailField
                label="Expiring soon"
                value={
                  batchStats.expiringSoon > 0 ? (
                    <span className="inline-flex items-center gap-2">
                      {batchStats.expiringSoon}
                      <Badge variant="warning">Within 30 days</Badge>
                    </span>
                  ) : (
                    "None"
                  )
                }
              />
            </DetailGrid>
          </DetailSection>
        </TabsContent>

        <TabsContent value="batches" className="mt-6 space-y-6">
          {canManage ? (
            <DetailSection title="Receive new batch">
              <ReceiveStockForm medicineId={medicineId} />
            </DetailSection>
          ) : null}
          {canManage ? (
            <DetailSection title="Stock movements">
              <StockOperationsPanel medicineId={medicineId} />
            </DetailSection>
          ) : null}
          <DetailSection title="Batch inventory">
            <DetailTable
              emptyLabel="No batches recorded. Receive stock to create the first batch."
              rows={batchesQuery.data ?? []}
              columns={[
                { key: "batch", header: "Batch", cell: (row) => String(row.batch_number) },
                {
                  key: "expiry",
                  header: "Expiry",
                  cell: (row) => <ExpiryBadge expiryDate={String(row.expiry_date)} />,
                },
                { key: "qty", header: "On hand", cell: (row) => String(row.quantity_on_hand) },
                {
                  key: "active",
                  header: "Status",
                  cell: (row) => <StatusText value={row.is_active ? "active" : "inactive"} />,
                },
                {
                  key: "actions",
                  header: "",
                  cell: (row) => <BatchActiveToggle batch={row as MedicineBatch} />,
                },
              ]}
            />
          </DetailSection>
        </TabsContent>

        <TabsContent value="history" className="mt-6 space-y-6">
          <DetailSection title="Inventory ledger">
            <InventoryLedger medicineId={medicineId} />
          </DetailSection>
        </TabsContent>

        {canManage ? (
          <TabsContent value="manage" className="mt-6 space-y-6">
            <DetailSection title="Catalog entry">
              <EditMedicineForm medicine={medicine} />
            </DetailSection>
          </TabsContent>
        ) : null}
      </Tabs>
    </DetailLayout>
  );
}
