"use client";

import { ArrowLeftRight } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";

import { AssignedBranchSelect } from "@/components/assigned-branch-select";
import { FormError } from "@/components/form-field-error";
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
import { allowed } from "@/features/access/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import { useResourceList } from "@/hooks/use-resource-list";
import { api, withQuery } from "@/lib/api/client";
import type { MedicineBatch } from "@/lib/api/types";
import { isOnline } from "@/offline/connectivity/network";
import { requireOnlineMutation } from "@/offline/sync/policy";

export function StockTransferForm() {
  const { account, branchId } = useAuth();
  const queryClient = useQueryClient();
  const [sourceBatchId, setSourceBatchId] = useState("");
  const [destinationBranchId, setDestinationBranchId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<unknown>(null);

  const batchesQuery = useResourceList<MedicineBatch>(
    "medicine-batches",
    branchId ? withQuery("/medicine-batches/", { page_size: "500" }) : null,
  );

  const dispensaryBranches = useMemo(
    () =>
      (account?.assigned_branches ?? []).filter(
        (branch) => branch.inventory_role === "dispensary" || branch.inventory_role === "both" || !branch.inventory_role,
      ),
    [account?.assigned_branches],
  );

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("pharmacy.transfer_stock", isOnline());
      return api("/stock-transfers/", {
        method: "POST",
        body: JSON.stringify({
          source_batch: sourceBatchId,
          destination_branch: destinationBranchId,
          quantity: Number(quantity),
        }),
      });
    },
    onSuccess: async () => {
      setSourceBatchId("");
      setDestinationBranchId("");
      setQuantity("");
      setError(null);
      toast.success("Stock transferred to clinic branch.");
      await queryClient.invalidateQueries({ queryKey: ["medicine-batches"] });
      await queryClient.invalidateQueries({ queryKey: ["medicines"] });
      await queryClient.invalidateQueries({ queryKey: ["stock-transactions"] });
    },
    onError: setError,
  });

  if (!account || !allowed(account.permissions, "pharmacy.manage")) {
    return null;
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!branchId) {
      setError(new Error("Select the store branch in the sidebar first."));
      return;
    }
    mutation.mutate();
  }

  return (
    <Card className="shadow-premium-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowLeftRight className="size-5 text-primary" aria-hidden="true" />
          Store to clinic transfer
        </CardTitle>
        <CardDescription>
          Move stock from the selected store branch to a dispensary branch without dispensing.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
          <AssignedBranchSelect id="transfer_source_branch" />
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="transfer_source_batch">Source batch</Label>
            <Select value={sourceBatchId} onValueChange={setSourceBatchId} disabled={!branchId || batchesQuery.isLoading}>
              <SelectTrigger id="transfer_source_batch">
                <SelectValue placeholder={batchesQuery.isLoading ? "Loading batches…" : "Select batch"} />
              </SelectTrigger>
              <SelectContent>
                {(batchesQuery.data ?? [])
                  .filter((batch) => Number(batch.quantity_on_hand) > 0)
                  .map((batch) => (
                    <SelectItem key={batch.id} value={batch.id}>
                      {batch.batch_number} · {batch.quantity_on_hand} on hand
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="transfer_destination_branch">Destination clinic branch</Label>
            <Select value={destinationBranchId} onValueChange={setDestinationBranchId}>
              <SelectTrigger id="transfer_destination_branch">
                <SelectValue placeholder="Select dispensary branch" />
              </SelectTrigger>
              <SelectContent>
                {dispensaryBranches
                  .filter((branch) => branch.id !== branchId)
                  .map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name} ({branch.code})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="transfer_quantity">Quantity</Label>
            <Input id="transfer_quantity" inputMode="numeric" value={quantity} required onChange={(event) => setQuantity(event.target.value)} />
          </div>
          <div className="flex items-end">
            <Button type="submit" size="sm" disabled={mutation.isPending || !branchId}>
              {mutation.isPending ? "Transferring…" : "Transfer stock"}
            </Button>
          </div>
          <div className="md:col-span-2">
            <FormError error={error} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
