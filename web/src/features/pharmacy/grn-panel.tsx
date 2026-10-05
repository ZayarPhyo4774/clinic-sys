"use client";

import { ClipboardCheck } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

import { AssignedBranchSelect } from "@/components/assigned-branch-select";
import { MedicineSelect, SupplierSelect } from "@/components/entity-picker";
import { FormError } from "@/components/form-field-error";
import { QueryState, describeError } from "@/components/query-state";
import { StatusText } from "@/components/record-browser";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { allowed } from "@/features/access/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import { api, withQuery } from "@/lib/api/client";
import type { GoodsReceiptNote, Page } from "@/lib/api/types";
import { isOnline } from "@/offline/connectivity/network";
import { requireOnlineMutation } from "@/offline/sync/policy";

function GrnDraftForm({ onCreated }: { onCreated: (grn: GoodsReceiptNote) => void }) {
  const { branchId } = useAuth();
  const [referenceNumber, setReferenceNumber] = useState("");
  const [receivedAt, setReceivedAt] = useState(new Date().toISOString().slice(0, 10));
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("pharmacy.create_grn", isOnline());
      return api<GoodsReceiptNote>("/goods-receipts/", {
        method: "POST",
        body: JSON.stringify({
          reference_number: referenceNumber,
          received_at: receivedAt,
          supplier: supplier || undefined,
          notes,
        }),
      });
    },
    onSuccess: (grn) => {
      setError(null);
      toast.success("GRN draft created.");
      onCreated(grn);
    },
    onError: setError,
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!branchId) {
      setError(new Error("Select a branch before creating a GRN."));
      return;
    }
    mutation.mutate();
  }

  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
      <AssignedBranchSelect id="grn_branch" />
      <div className="space-y-2">
        <Label htmlFor="grn_reference">GRN reference</Label>
        <Input id="grn_reference" value={referenceNumber} onChange={(event) => setReferenceNumber(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="grn_received_at">Received date</Label>
        <Input id="grn_received_at" type="date" value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} required />
      </div>
      <SupplierSelect id="grn_supplier" value={supplier} onValueChange={setSupplier} optional />
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="grn_notes">Notes</Label>
        <Input id="grn_notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
      </div>
      <div className="md:col-span-2">
        <Button type="submit" size="sm" disabled={!branchId || mutation.isPending}>
          {mutation.isPending ? "Creating…" : "Create GRN draft"}
        </Button>
      </div>
      <div className="md:col-span-2">
        <FormError error={error} />
      </div>
    </form>
  );
}

function GrnLineEditor({ grnId }: { grnId: string }) {
  const queryClient = useQueryClient();
  const [medicineId, setMedicineId] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<unknown>(null);

  const grnQuery = useQuery({
    queryKey: ["goods-receipts", grnId],
    queryFn: () => api<GoodsReceiptNote>(`/goods-receipts/${grnId}/`),
  });

  const addLine = useMutation({
    mutationFn: () =>
      api(`/goods-receipts/${grnId}/lines/`, {
        method: "POST",
        body: JSON.stringify({
          medicine: medicineId,
          batch_number: batchNumber,
          expiry_date: expiryDate,
          quantity: Number(quantity),
        }),
      }),
    onSuccess: async () => {
      setMedicineId("");
      setBatchNumber("");
      setExpiryDate("");
      setQuantity("");
      setError(null);
      toast.success("Line added.");
      await queryClient.invalidateQueries({ queryKey: ["goods-receipts", grnId] });
      await queryClient.invalidateQueries({ queryKey: ["goods-receipts"] });
    },
    onError: setError,
  });

  const postGrn = useMutation({
    mutationFn: () => api<GoodsReceiptNote>(`/goods-receipts/${grnId}/post/`, { method: "POST" }),
    onSuccess: async () => {
      toast.success("GRN posted. Stock received.");
      await queryClient.invalidateQueries({ queryKey: ["goods-receipts"] });
      await queryClient.invalidateQueries({ queryKey: ["medicine-batches"] });
      await queryClient.invalidateQueries({ queryKey: ["medicines"] });
      await queryClient.invalidateQueries({ queryKey: ["stock-transactions"] });
    },
    onError: setError,
  });

  const grn = grnQuery.data;
  if (grnQuery.isLoading) {
    return <QueryState status="loading" />;
  }
  if (grnQuery.isError || !grn) {
    return <QueryState status="error" detail={describeError(grnQuery.error)} onRetry={() => void grnQuery.refetch()} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">{grn.reference_number || "Draft GRN"}</p>
          <p className="text-sm text-muted-foreground">
            {grn.branch_name} · {grn.received_at} · <StatusText value={grn.status} />
          </p>
        </div>
        {grn.status === "draft" ? (
          <Button type="button" size="sm" disabled={postGrn.isPending || grn.line_count === 0} onClick={() => postGrn.mutate()}>
            {postGrn.isPending ? "Posting…" : "Post GRN"}
          </Button>
        ) : null}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Medicine</TableHead>
            <TableHead>Batch</TableHead>
            <TableHead>Expiry</TableHead>
            <TableHead className="text-right">Qty</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {grn.lines.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                No lines yet.
              </TableCell>
            </TableRow>
          ) : (
            grn.lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell>
                  {line.medicine_name}
                  <p className="text-xs text-muted-foreground">{line.medicine_code}</p>
                </TableCell>
                <TableCell>{line.batch_number}</TableCell>
                <TableCell>{line.expiry_date}</TableCell>
                <TableCell className="text-right tabular-nums">{line.quantity}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {grn.status === "draft" ? (
        <form
          className="grid gap-4 rounded-xl border bg-muted/20 p-4 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            addLine.mutate();
          }}
        >
          <MedicineSelect id="grn_line_medicine" value={medicineId} onValueChange={setMedicineId} />
          <div className="space-y-2">
            <Label htmlFor="grn_line_batch">Batch number</Label>
            <Input id="grn_line_batch" value={batchNumber} required onChange={(event) => setBatchNumber(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="grn_line_expiry">Expiry date</Label>
            <Input id="grn_line_expiry" type="date" value={expiryDate} required onChange={(event) => setExpiryDate(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="grn_line_qty">Quantity</Label>
            <Input id="grn_line_qty" inputMode="numeric" value={quantity} required onChange={(event) => setQuantity(event.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Button type="submit" size="sm" disabled={addLine.isPending || !medicineId}>
              {addLine.isPending ? "Adding…" : "Add line"}
            </Button>
          </div>
          <div className="md:col-span-2">
            <FormError error={error} />
          </div>
        </form>
      ) : null}
    </div>
  );
}

export function GrnPanel() {
  const { account } = useAuth();
  const [activeGrnId, setActiveGrnId] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ["goods-receipts", "list"],
    queryFn: () => api<Page<GoodsReceiptNote>>(withQuery("/goods-receipts/", { page_size: "50", ordering: "-received_at" })),
    enabled: Boolean(account && allowed(account.permissions, "pharmacy.manage")),
  });

  if (!account || !allowed(account.permissions, "pharmacy.manage")) {
    return null;
  }

  return (
    <div className="space-y-6">
      <Card className="shadow-premium-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="size-5 text-primary" aria-hidden="true" />
            Goods Receipt Note (GRN)
          </CardTitle>
          <CardDescription>
            Create a store GRN draft, add many product lines, then post once to receive all stock into inventory.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GrnDraftForm onCreated={(grn) => setActiveGrnId(grn.id)} />
        </CardContent>
      </Card>

      {listQuery.data?.results.length ? (
        <Card className="shadow-premium-sm">
          <CardHeader>
            <CardTitle className="text-base">Recent GRNs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {listQuery.data.results.map((grn) => (
              <button
                key={grn.id}
                type="button"
                className="flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left hover:bg-muted/30"
                onClick={() => setActiveGrnId(grn.id)}
              >
                <span>
                  <span className="font-medium">{grn.reference_number || "Draft GRN"}</span>
                  <span className="ml-2 text-sm text-muted-foreground">
                    {grn.branch_name} · {grn.line_count} lines
                  </span>
                </span>
                <StatusText value={grn.status} />
              </button>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {activeGrnId ? <GrnLineEditor grnId={activeGrnId} /> : null}
    </div>
  );
}
