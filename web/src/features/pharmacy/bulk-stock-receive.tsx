"use client";

import { Download, Upload } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { AssignedBranchSelect } from "@/components/assigned-branch-select";
import { FormError } from "@/components/form-field-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { allowed } from "@/features/access/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import { apiUpload } from "@/lib/api/client";
import type { BulkStockReceiveResult } from "@/lib/api/types";
import { isOnline } from "@/offline/connectivity/network";
import { requireOnlineMutation } from "@/offline/sync/policy";

const TEMPLATE = [
  "medicine_code,batch_number,expiry_date,quantity",
  "paracetamol-500,DEMO-001,2027-12-31,100",
  "amoxicillin-500,DEMO-002,2027-06-30,50",
].join("\n");

function downloadTemplate() {
  const blob = new Blob([TEMPLATE], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "stock-receive-template.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function BulkStockReceive() {
  const { account, branchId } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [referenceNumber, setReferenceNumber] = useState("");
  const [result, setResult] = useState<BulkStockReceiveResult | null>(null);
  const [error, setError] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: (file: File) => {
      requireOnlineMutation("pharmacy.bulk_receive_stock", isOnline());
      const formData = new FormData();
      formData.append("file", file);
      if (referenceNumber.trim()) {
        formData.append("reference_number", referenceNumber.trim());
      }
      return apiUpload<BulkStockReceiveResult>("/stock-receive/bulk/", formData);
    },
    onSuccess: async (payload) => {
      setResult(payload);
      setError(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      await queryClient.invalidateQueries({ queryKey: ["medicine-batches"] });
      await queryClient.invalidateQueries({ queryKey: ["medicines"] });
      await queryClient.invalidateQueries({ queryKey: ["stock-transactions"] });
      toast.success(
        `${payload.created + payload.updated} line${payload.created + payload.updated === 1 ? "" : "s"} processed · ${payload.created} new batch${payload.created === 1 ? "" : "es"}.`,
      );
    },
    onError: (caught) => {
      setResult(null);
      setError(caught);
    },
  });

  if (!account || !allowed(account.permissions, "pharmacy.manage")) {
    return null;
  }

  return (
    <Card className="shadow-premium-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="size-5 text-primary" aria-hidden="true" />
          Bulk stock receive
        </CardTitle>
        <CardDescription>
          Receive many medicines in one upload. Select the store branch first, then upload a CSV.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <AssignedBranchSelect id="bulk_stock_branch" />
        {!branchId ? (
          <p className="text-sm text-destructive">Select a branch in the sidebar before receiving stock.</p>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="bulk_stock_reference">Reference (optional)</Label>
          <Input
            id="bulk_stock_reference"
            value={referenceNumber}
            onChange={(event) => setReferenceNumber(event.target.value)}
            placeholder="GRN-2026-001"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="mr-2 size-4" aria-hidden="true" />
            Download template
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!branchId || mutation.isPending}
            onClick={() => fileInputRef.current?.click()}
          >
            {mutation.isPending ? "Uploading…" : "Upload CSV"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                setError(null);
                setResult(null);
                mutation.mutate(file);
              }
            }}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          Required columns: medicine_code, batch_number, expiry_date, quantity. Medicine codes must already exist in
          the catalog.
        </p>

        <FormError error={error} />

        {result && result.errors.length > 0 ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm font-semibold">
              {result.errors.length} row{result.errors.length === 1 ? "" : "s"} failed
            </p>
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm">
              {result.errors.map((row) => (
                <li key={`${row.row}-${row.medicine_code ?? "row"}`}>
                  Row {row.row}
                  {row.medicine_code ? ` (${row.medicine_code})` : ""}: {row.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
