"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

import { ActionBar } from "@/components/action-bar";
import { PaymentMethodSelect } from "@/components/entity-picker";
import { FormError, FormFieldError } from "@/components/form-field-error";
import { Button } from "@/components/ui/button";
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
import { api, withQuery } from "@/lib/api/client";
import { validationError } from "@/lib/api/errors";
import type { Invoice, Page, Prescription, PrescriptionItem } from "@/lib/api/types";
import { invoiceLineSchema, recordPaymentSchema, validateForm } from "@/lib/forms/schemas";
import { isOnline } from "@/offline/connectivity/network";
import { requireOnlineMutation } from "@/offline/sync/policy";

type BillableItem = PrescriptionItem & { prescriptionId: string; label: string };

async function loadDispensedItems(encounterId: string) {
  const prescriptions = await api<Page<Prescription>>(withQuery("/prescriptions/", { encounter: encounterId }));
  const items: BillableItem[] = [];
  for (const prescription of prescriptions.results) {
    const page = await api<Page<PrescriptionItem>>(`/prescriptions/${prescription.id}/items/`);
    for (const item of page.results) {
      if (Number(item.quantity_dispensed) > 0) {
        items.push({
          ...item,
          prescriptionId: prescription.id,
          label: `${item.dosage} · dispensed ${item.quantity_dispensed}/${item.quantity}`,
        });
      }
    }
  }
  return items;
}

export function InvoiceWritePanel({
  invoice,
  onUpdated,
}: {
  invoice: Invoice;
  onUpdated: () => void;
}) {
  return (
    <div className="space-y-6">
      <AddInvoiceItemForm invoice={invoice} onUpdated={onUpdated} />
      <IssueInvoiceButton invoice={invoice} onUpdated={onUpdated} />
      <RecordPaymentForm invoice={invoice} onUpdated={onUpdated} />
    </div>
  );
}

function AddInvoiceItemForm({ invoice, onUpdated }: { invoice: Invoice; onUpdated: () => void }) {
  const { account } = useAuth();
  const queryClient = useQueryClient();
  const isManual = !invoice.encounter;
  const [kind, setKind] = useState<"consultation" | "pharmacy">("consultation");
  const [description, setDescription] = useState("");
  const [prescriptionItem, setPrescriptionItem] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [error, setError] = useState<unknown>(null);

  const canCreate = Boolean(account && allowed(account.permissions, "billing.create") && invoice.status === "draft");
  const dispensedItems = useQuery({
    queryKey: ["billable-items", invoice.encounter],
    enabled: canCreate && !isManual && kind === "pharmacy" && Boolean(invoice.encounter),
    queryFn: () => loadDispensedItems(invoice.encounter as string),
  });

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("billing.add_item", isOnline());
      const payload = isManual
        ? {
            kind: "consultation" as const,
            description: description.trim(),
            quantity: Number(quantity),
            unit_price: unitPrice.trim(),
            ...(discountAmount.trim() ? { discount_amount: discountAmount.trim() } : {}),
          }
        : {
            kind,
            description: description.trim() || undefined,
            prescription_item: kind === "pharmacy" ? prescriptionItem : undefined,
            quantity: Number(quantity),
            unit_price: unitPrice.trim(),
            discount_amount: discountAmount.trim() || undefined,
          };
      return api(`/invoices/${invoice.id}/items/`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async () => {
      setDescription("");
      setPrescriptionItem("");
      setQuantity("1");
      setUnitPrice("");
      setDiscountAmount("");
      setError(null);
      toast.success("Line item added.");
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
      onUpdated();
    },
    onError: (caught) => setError(caught),
  });

  if (!canCreate) {
    return null;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (isManual && !description.trim()) {
      setError(validationError({ description: ["Enter a description."] }));
      return;
    }
    if (
      !validateForm(
        invoiceLineSchema,
        {
          kind,
          description: description.trim() || undefined,
          quantity,
          unit_price: unitPrice,
          discount_amount: discountAmount || undefined,
          prescription_item: kind === "pharmacy" ? prescriptionItem : undefined,
        },
        setError,
      )
    ) {
      return;
    }
    mutation.mutate();
  }

  return (
    <form className="grid gap-4 rounded-lg border bg-card p-4 md:grid-cols-2" onSubmit={onSubmit}>
      <p className="text-sm font-medium md:col-span-2">Add line item</p>
      {isManual ? (
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="item_description">Description</Label>
          <Input
            id="item_description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="e.g. Walk-in consultation"
            maxLength={50}
          />
          <FormFieldError error={error} name="description" />
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="item_kind">Kind</Label>
          <Select value={kind} onValueChange={(value) => setKind(value as "consultation" | "pharmacy")}>
            <SelectTrigger id="item_kind" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="consultation">Consultation</SelectItem>
              <SelectItem value="pharmacy">Pharmacy</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      {!isManual && kind === "pharmacy" ? (
        <div className="space-y-2">
          <Label htmlFor="prescription_item">Dispensed item</Label>
          <Select value={prescriptionItem} onValueChange={setPrescriptionItem} disabled={dispensedItems.isLoading}>
            <SelectTrigger id="prescription_item" className="w-full">
              <SelectValue placeholder={dispensedItems.isLoading ? "Loading…" : "Select item"} />
            </SelectTrigger>
            <SelectContent>
              {(dispensedItems.data ?? []).map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormFieldError error={error} name="prescription_item" />
        </div>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="item_quantity">Quantity</Label>
        <Input id="item_quantity" inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
        <FormFieldError error={error} name="quantity" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="item_unit_price">Unit price</Label>
        <Input id="item_unit_price" inputMode="decimal" value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} />
        <FormFieldError error={error} name="unit_price" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="item_discount">Discount</Label>
        <Input
          id="item_discount"
          inputMode="decimal"
          value={discountAmount}
          onChange={(event) => setDiscountAmount(event.target.value)}
        />
        <FormFieldError error={error} name="discount_amount" />
      </div>
      <div className="md:col-span-2">
        <Button type="submit" size="sm" disabled={mutation.isPending}>
          {mutation.isPending ? "Adding…" : "Add line item"}
        </Button>
      </div>
      <div className="md:col-span-2">
        <FormFieldError error={error} name="kind" />
        <FormError error={error} />
      </div>
    </form>
  );
}

function IssueInvoiceButton({ invoice, onUpdated }: { invoice: Invoice; onUpdated: () => void }) {
  const { account } = useAuth();
  const queryClient = useQueryClient();
  const canIssue = Boolean(
    account && allowed(account.permissions, "billing.create") && invoice.status === "draft" && invoice.items.length > 0,
  );

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("billing.issue", isOnline());
      return api<Invoice>(`/invoices/${invoice.id}/issue/`, { method: "POST", body: "{}" });
    },
    onSuccess: async () => {
      toast.success("Invoice issued.");
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
      onUpdated();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "The invoice could not be issued.");
    },
  });

  if (!canIssue) {
    return null;
  }

  return (
    <ActionBar>
      <Button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? "Issuing…" : "Issue invoice"}
      </Button>
    </ActionBar>
  );
}

function RecordPaymentForm({ invoice, onUpdated }: { invoice: Invoice; onUpdated: () => void }) {
  const { account } = useAuth();
  const queryClient = useQueryClient();
  const [method, setMethod] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<unknown>(null);

  const canPay = Boolean(
    account &&
      allowed(account.permissions, "billing.payment") &&
      (invoice.status === "issued" || invoice.status === "partially_paid") &&
      Number(invoice.balance) > 0,
  );

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("billing.payment", isOnline());
      return api(`/invoices/${invoice.id}/payments/`, {
        method: "POST",
        body: JSON.stringify({ method, amount }),
      });
    },
    onSuccess: async () => {
      setMethod("");
      setAmount("");
      setError(null);
      toast.success("Payment recorded.");
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
      await queryClient.invalidateQueries({ queryKey: ["payments"] });
      onUpdated();
    },
    onError: (caught) => setError(caught),
  });

  if (!canPay) {
    return null;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!validateForm(recordPaymentSchema, { method, amount }, setError)) {
      return;
    }
    mutation.mutate();
  }

  return (
    <form className="grid gap-4 rounded-lg border bg-card p-4 md:grid-cols-2" onSubmit={onSubmit}>
      <p className="text-sm font-medium md:col-span-2">Record payment · balance {invoice.balance}</p>
      <PaymentMethodSelect id={`pay_method_${invoice.id}`} value={method} onValueChange={setMethod} />
      <div className="space-y-2">
        <Label htmlFor={`pay_amount_${invoice.id}`}>Amount</Label>
        <Input id={`pay_amount_${invoice.id}`} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
        <FormFieldError error={error} name="amount" />
      </div>
      <div className="md:col-span-2">
        <Button type="submit" size="sm" disabled={mutation.isPending}>
          {mutation.isPending ? "Recording…" : "Record payment"}
        </Button>
      </div>
      <div className="md:col-span-2">
        <FormFieldError error={error} name="method" />
        <FormError error={error} />
      </div>
    </form>
  );
}
