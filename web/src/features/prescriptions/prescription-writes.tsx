"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { BatchSelect, MedicineSelect } from "@/components/entity-picker";
import { FormError, FormFieldError } from "@/components/form-field-error";
import { ActionBar } from "@/components/action-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { allowed } from "@/features/access/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import { api } from "@/lib/api/client";
import { formatMedicineUnit, formatQuantityWithUnit } from "@/features/prescriptions/prescription-utils";
import { useMedicineLabelMap } from "@/features/prescriptions/use-medicine-labels";
import type { Prescription, PrescriptionItem } from "@/lib/api/types";
import { prescriptionItemSchema, validateForm } from "@/lib/forms/schemas";
import { isOnline } from "@/offline/connectivity/network";
import { requireOnlineMutation } from "@/offline/sync/policy";

export function CancelPrescriptionButton({
  prescriptionId,
  status,
  onUpdated,
  compact = false,
}: {
  prescriptionId: string;
  status: string;
  onUpdated: () => void;
  compact?: boolean;
}) {
  const { account } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const canCancel = Boolean(account && allowed(account.permissions, "prescriptions.create") && status === "active");
  const cancelReason = !account
    ? "Sign in required."
    : !allowed(account.permissions, "prescriptions.create")
      ? "Requires prescriptions.create permission."
      : status !== "active"
        ? "Only active prescriptions can be cancelled."
        : null;

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("prescriptions.cancel", isOnline());
      return api<Prescription>(`/prescriptions/${prescriptionId}/cancel/`, { method: "POST", body: "{}" });
    },
    onSuccess: async () => {
      setOpen(false);
      toast.success("Prescription cancelled.");
      await queryClient.invalidateQueries({ queryKey: ["prescriptions"] });
      onUpdated();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "The prescription could not be cancelled.");
    },
  });

  const button = (
    <Button type="button" variant="outline" size={compact ? "sm" : "default"} onClick={() => setOpen(true)} disabled={!canCancel}>
      Cancel prescription
    </Button>
  );

  return (
    <>
      {compact ? (
        button
      ) : (
        <ActionBar>
          {button}
          {!canCancel && cancelReason ? <p className="text-xs text-muted-foreground">{cancelReason}</p> : null}
        </ActionBar>
      )}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Cancel this prescription?"
        description="This is only allowed before any medicine has been dispensed."
        confirmLabel="Cancel prescription"
        destructive
        pending={mutation.isPending}
        onConfirm={() => mutation.mutate()}
      />
    </>
  );
}

export function AddPrescriptionItemForm({
  prescriptionId,
  status,
  onUpdated,
}: {
  prescriptionId: string;
  status: string;
  onUpdated: () => void;
}) {
  const { account } = useAuth();
  const queryClient = useQueryClient();
  const [medicine, setMedicine] = useState("");
  const [quantity, setQuantity] = useState("");
  const [dosage, setDosage] = useState("");
  const [frequency, setFrequency] = useState("");
  const [durationDays, setDurationDays] = useState("");
  const [error, setError] = useState<unknown>(null);
  const { unitFor } = useMedicineLabelMap();
  const selectedUnit = medicine ? unitFor(medicine) : "";

  const canAdd = Boolean(
    account &&
      allowed(account.permissions, "prescriptions.create") &&
      (status === "active" || status === "partially_dispensed"),
  );
  const addReason = !account
    ? "Sign in required."
    : !allowed(account.permissions, "prescriptions.create")
      ? "Requires prescriptions.create permission."
      : status === "cancelled"
        ? "Cancelled prescriptions cannot receive new items."
        : status === "dispensed"
          ? "Fully dispensed prescriptions are locked."
          : null;

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("prescriptions.add_item", isOnline());
      return api<PrescriptionItem>(`/prescriptions/${prescriptionId}/items/`, {
        method: "POST",
        body: JSON.stringify({
          medicine,
          quantity: Number(quantity),
          dosage,
          frequency: frequency || undefined,
          duration_days: durationDays ? Number(durationDays) : undefined,
        }),
      });
    },
    onSuccess: async () => {
      setMedicine("");
      setQuantity("");
      setDosage("");
      setFrequency("");
      setDurationDays("");
      setError(null);
      toast.success("Item added.");
      await queryClient.invalidateQueries({ queryKey: ["prescription-items"] });
      await queryClient.invalidateQueries({ queryKey: ["prescriptions"] });
      onUpdated();
    },
    onError: (caught) => setError(caught),
  });

  if (!canAdd) {
    return (
      <div className="rounded-lg border bg-muted/30 p-4">
        <p className="text-sm font-medium">Add prescription item</p>
        <p className="mt-1 text-sm text-muted-foreground">{addReason ?? "This action is currently unavailable."}</p>
      </div>
    );
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (
      !validateForm(
        prescriptionItemSchema,
        {
          medicine,
          quantity,
          dosage,
          frequency,
          duration_days: durationDays ? Number(durationDays) : null,
        },
        setError,
      )
    ) {
      return;
    }
    mutation.mutate();
  }

  return (
    <form className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-2" onSubmit={onSubmit}>
      <p className="text-sm font-medium md:col-span-2">Add prescription item</p>
      <MedicineSelect id={`add_rx_medicine_${prescriptionId}`} value={medicine} onValueChange={setMedicine} />
      <div className="space-y-2">
        <Label htmlFor={`add_rx_qty_${prescriptionId}`}>
          Quantity{selectedUnit ? ` (${formatMedicineUnit(selectedUnit, quantity || 2)})` : ""}
        </Label>
        <Input
          id={`add_rx_qty_${prescriptionId}`}
          inputMode="numeric"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`add_rx_dosage_${prescriptionId}`}>Dosage</Label>
        <Input
          id={`add_rx_dosage_${prescriptionId}`}
          value={dosage}
          onChange={(event) => setDosage(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`add_rx_frequency_${prescriptionId}`}>Frequency</Label>
        <Input
          id={`add_rx_frequency_${prescriptionId}`}
          value={frequency}
          onChange={(event) => setFrequency(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`add_rx_duration_${prescriptionId}`}>Duration (days)</Label>
        <Input
          id={`add_rx_duration_${prescriptionId}`}
          inputMode="numeric"
          value={durationDays}
          onChange={(event) => setDurationDays(event.target.value)}
        />
      </div>
      <div className="md:col-span-2">
        <Button type="submit" size="sm" disabled={mutation.isPending}>
          {mutation.isPending ? "Adding…" : "Add item"}
        </Button>
      </div>
      <div className="md:col-span-2">
        <FormFieldError error={error} name="medicine" />
        <FormFieldError error={error} name="quantity" />
        <FormFieldError error={error} name="dosage" />
        <FormError error={error} />
      </div>
    </form>
  );
}

export function DispenseItemForm({
  prescriptionId,
  item,
  onUpdated,
}: {
  prescriptionId: string;
  item: PrescriptionItem;
  onUpdated: () => void;
}) {
  const { account } = useAuth();
  const queryClient = useQueryClient();
  const [batch, setBatch] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [error, setError] = useState<unknown>(null);

  const { unitFor } = useMedicineLabelMap();
  const unit = item.medicine_unit || unitFor(item.medicine);
  const remaining = Number(item.quantity) - Number(item.quantity_dispensed);
  const canDispense = Boolean(account && allowed(account.permissions, "pharmacy.manage") && remaining > 0);
  const dispenseReason = !account
    ? "Sign in required."
    : !allowed(account.permissions, "pharmacy.manage")
      ? "Requires pharmacy.manage permission."
      : remaining <= 0
        ? "Item already fully dispensed."
        : null;

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("prescriptions.dispense", isOnline());
      return api(`/prescriptions/${prescriptionId}/items/${item.id}/dispense/`, {
        method: "POST",
        body: JSON.stringify({
          batch,
          quantity: Number(quantity),
        }),
      });
    },
    onSuccess: async () => {
      setBatch("");
      setQuantity("1");
      setError(null);
      toast.success("Item dispensed.");
      await queryClient.invalidateQueries({ queryKey: ["prescriptions"] });
      await queryClient.invalidateQueries({ queryKey: ["prescription-items"] });
      onUpdated();
    },
    onError: (caught) => setError(caught),
  });

  if (!canDispense) {
    return <p className="mt-2 text-xs text-muted-foreground">{dispenseReason ?? "Dispense unavailable."}</p>;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!batch) {
      setError(new Error("Select a batch."));
      return;
    }
    const requested = Number(quantity);
    if (!Number.isFinite(requested) || requested < 1) {
      setError(new Error("Enter a valid quantity."));
      return;
    }
    if (requested > remaining) {
      setError(
        new Error(`Quantity exceeds remaining amount (${formatQuantityWithUnit(remaining, unit)}).`),
      );
      return;
    }
    mutation.mutate();
  }

  return (
    <form className="mt-2 grid gap-2 rounded-md border bg-muted/30 p-3 sm:grid-cols-2 xl:grid-cols-3" onSubmit={onSubmit}>
      <BatchSelect id={`batch_${item.id}`} medicineId={item.medicine} value={batch} onValueChange={setBatch} />
      <div className="space-y-2">
        <Label htmlFor={`qty_${item.id}`}>
          Quantity{unit ? ` (${formatMedicineUnit(unit, quantity || 2)})` : ""}
        </Label>
        <Input
          id={`qty_${item.id}`}
          inputMode="numeric"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Remaining: {formatQuantityWithUnit(remaining, unit)}
        </p>
      </div>
      <div className="flex items-end sm:col-span-2 xl:col-span-1">
        <div className="flex w-full flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setQuantity(String(remaining))}>
            Dispense full remaining
          </Button>
          <Button type="submit" size="sm" disabled={mutation.isPending}>
            {mutation.isPending ? "Dispensing…" : "Dispense"}
          </Button>
        </div>
      </div>
      <div className="sm:col-span-2 xl:col-span-3">
        <p className="text-xs text-muted-foreground">
          Select a valid in-branch batch with enough stock. Near-expiry batches are marked in the picker.
        </p>
      </div>
      <div className="sm:col-span-2 xl:col-span-3">
        <FormFieldError error={error} name="batch" />
        <FormFieldError error={error} name="quantity" />
        <FormError error={error} />
      </div>
    </form>
  );
}
