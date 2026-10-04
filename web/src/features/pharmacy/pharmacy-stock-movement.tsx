"use client";

import { ArrowDownToLine, ArrowUpFromLine, Package, PackagePlus, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { MedicineSelect } from "@/components/entity-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AddStockToBatchForm,
  AdjustStockForm,
  ReceiveStockForm,
  StockOutForm,
} from "@/features/pharmacy/pharmacy-writes";
import { useResourceList } from "@/hooks/use-resource-list";
import { withQuery } from "@/lib/api/client";
import type { Medicine } from "@/lib/api/types";

function formatLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function SelectedMedicineSummary({ medicine }: { medicine: Medicine }) {
  const lowStock = medicine.available_quantity <= medicine.reorder_level;

  return (
    <Card className="shadow-premium-sm">
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{medicine.code}</Badge>
            {!medicine.is_active ? <Badge variant="secondary">Inactive</Badge> : null}
            {lowStock && medicine.is_active ? (
              medicine.available_quantity === 0 ? (
                <Badge variant="destructive">Out of stock</Badge>
              ) : (
                <Badge variant="warning">Low stock</Badge>
              )
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {formatLabel(medicine.form)} · {medicine.strength} {medicine.unit}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 rounded-xl border bg-muted/30 px-4 py-3">
            <Package className="size-5 text-primary" aria-hidden="true" />
            <div>
              <p className="text-2xl font-bold tabular-nums">{medicine.available_quantity}</p>
              <p className="text-xs text-muted-foreground">{medicine.unit} available</p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={`/pharmacy/${medicine.id}`}>Open medicine</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function PharmacyStockMovement() {
  const [medicineId, setMedicineId] = useState("");
  const [movementTab, setMovementTab] = useState("receive");

  const medicinesQuery = useResourceList<Medicine>(
    "medicines",
    withQuery("/medicines/", { page_size: "200" }),
  );

  const selectedMedicine = useMemo(
    () => medicinesQuery.data?.find((row) => row.id === medicineId),
    [medicineId, medicinesQuery.data],
  );

  return (
    <div className="space-y-6">
      <Card className="shadow-premium-sm">
        <CardHeader>
          <CardTitle>Stock movement</CardTitle>
          <CardDescription>Select a medicine, then record stock in, stock out, adjustments, or receive a new batch.</CardDescription>
        </CardHeader>
        <CardContent>
          <MedicineSelect
            id="pharmacy_stock_medicine"
            value={medicineId}
            onValueChange={(value) => {
              setMedicineId(value);
              setMovementTab("receive");
            }}
          />
        </CardContent>
      </Card>

      {!medicineId ? (
        <div className="rounded-xl border border-dashed px-6 py-12 text-center shadow-premium-sm">
          <PackagePlus className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium">Choose a medicine to begin</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Stock movements are recorded against a medicine batch and appear in the inventory ledger.
          </p>
        </div>
      ) : (
        <div key={medicineId} className="space-y-6">
          {selectedMedicine ? <SelectedMedicineSummary medicine={selectedMedicine} /> : null}

          <Tabs value={movementTab} onValueChange={setMovementTab}>
            <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
              <TabsTrigger value="receive" className="gap-2">
                <PackagePlus className="size-4" aria-hidden="true" />
                Receive batch
              </TabsTrigger>
              <TabsTrigger value="stock_in" className="gap-2">
                <ArrowDownToLine className="size-4" aria-hidden="true" />
                Stock in
              </TabsTrigger>
              <TabsTrigger value="stock_out" className="gap-2">
                <ArrowUpFromLine className="size-4" aria-hidden="true" />
                Stock out
              </TabsTrigger>
              <TabsTrigger value="adjustment" className="gap-2">
                <SlidersHorizontal className="size-4" aria-hidden="true" />
                Adjustment
              </TabsTrigger>
            </TabsList>

            <TabsContent value="receive" className="mt-6">
              <div className="rounded-xl border bg-card p-4 shadow-premium-sm">
                <p className="mb-4 text-sm text-muted-foreground">
                  Create a new batch with batch number, expiry date, and initial quantity.
                </p>
                <ReceiveStockForm medicineId={medicineId} />
              </div>
            </TabsContent>

            <TabsContent value="stock_in" className="mt-6">
              <div className="rounded-xl border bg-card p-4 shadow-premium-sm">
                <p className="mb-4 text-sm text-muted-foreground">Add units to an existing batch.</p>
                <AddStockToBatchForm medicineId={medicineId} />
              </div>
            </TabsContent>

            <TabsContent value="stock_out" className="mt-6">
              <div className="rounded-xl border bg-card p-4 shadow-premium-sm">
                <p className="mb-4 text-sm text-muted-foreground">
                  Remove damaged, expired, or wasted units from a batch.
                </p>
                <StockOutForm medicineId={medicineId} />
              </div>
            </TabsContent>

            <TabsContent value="adjustment" className="mt-6">
              <div className="rounded-xl border bg-card p-4 shadow-premium-sm">
                <p className="mb-4 text-sm text-muted-foreground">
                  Correct on-hand counts after a physical inventory check.
                </p>
                <AdjustStockForm medicineId={medicineId} embedded />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
