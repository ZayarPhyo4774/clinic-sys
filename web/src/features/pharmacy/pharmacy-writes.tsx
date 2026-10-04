"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

import { BatchSelect, CategorySelect, SupplierSelect } from "@/components/entity-picker";
import { ToggleActiveButton } from "@/features/organization/org-writes";
import { FormError, FormFieldError } from "@/components/form-field-error";
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
import { api } from "@/lib/api/client";
import { formatStockReason } from "@/features/pharmacy/stock-labels";
import {
  addStockToBatchSchema,
  adjustStockSchema,
  catalogCreateSchema,
  catalogRenameSchema,
  medicineCreateSchema,
  medicineEditSchema,
  receiveStockSchema,
  stockAdjustmentReasons,
  stockOutReasons,
  stockOutSchema,
  validateForm,
} from "@/lib/forms/schemas";
import type { Medicine, MedicineBatch, MedicineCategory, Supplier } from "@/lib/api/types";
import { isOnline } from "@/offline/connectivity/network";
import { requireOnlineMutation } from "@/offline/sync/policy";

const medicineForms = ["tablet", "capsule", "syrup", "injection", "cream", "other"] as const;
const medicineUnits = ["tablet", "capsule", "ml", "vial", "tube", "piece"] as const;

export function CreateMedicineForm() {
  const { account } = useAuth();
  const queryClient = useQueryClient();
  const [category, setCategory] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [form, setForm] = useState<string>("tablet");
  const [strength, setStrength] = useState("");
  const [unit, setUnit] = useState<string>("tablet");
  const [reorderLevel, setReorderLevel] = useState("0");
  const [error, setError] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("pharmacy.create_medicine", isOnline());
      return api<Medicine>("/medicines/", {
        method: "POST",
        body: JSON.stringify({
          category,
          name,
          code,
          form,
          strength,
          unit,
          reorder_level: Number(reorderLevel),
        }),
      });
    },
    onSuccess: async () => {
      setName("");
      setCode("");
      setStrength("");
      setReorderLevel("0");
      setError(null);
      toast.success("Medicine created.");
      await queryClient.invalidateQueries({ queryKey: ["medicines"] });
    },
    onError: (caught) => setError(caught),
  });

  if (!account || !allowed(account.permissions, "pharmacy.manage")) {
    return null;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (
      !validateForm(
        medicineCreateSchema,
        { category, name, code, form, strength, unit, reorder_level: reorderLevel },
        setError,
      )
    ) {
      return;
    }
    mutation.mutate();
  }

  return (
    <Card className="shadow-premium-sm">
      <CardHeader>
        <CardTitle>Add medicine</CardTitle>
        <CardDescription>Create a catalog entry before receiving stock.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
          <CategorySelect id="medicine_category" value={category} onValueChange={setCategory} />
          <div className="space-y-2">
            <Label htmlFor="medicine_name">Name</Label>
            <Input id="medicine_name" value={name} required onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="medicine_code">Code</Label>
            <Input id="medicine_code" value={code} required onChange={(event) => setCode(event.target.value)} />
            <FormFieldError error={error} name="code" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="medicine_strength">Strength</Label>
            <Input id="medicine_strength" value={strength} required onChange={(event) => setStrength(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="medicine_form">Form</Label>
            <Select value={form} onValueChange={setForm}>
              <SelectTrigger id="medicine_form" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {medicineForms.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="medicine_unit">Unit</Label>
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger id="medicine_unit" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {medicineUnits.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="medicine_reorder">Reorder level</Label>
            <Input
              id="medicine_reorder"
              inputMode="numeric"
              value={reorderLevel}
              onChange={(event) => setReorderLevel(event.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <Button type="submit" disabled={mutation.isPending || !category}>
              {mutation.isPending ? "Saving…" : "Create medicine"}
            </Button>
          </div>
          <div className="md:col-span-2">
            <FormFieldError error={error} name="category" />
            <FormError error={error} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function ReceiveStockForm({ medicineId }: { medicineId: string }) {
  const { account } = useAuth();
  const queryClient = useQueryClient();
  const [batchNumber, setBatchNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [quantity, setQuantity] = useState("");
  const [supplier, setSupplier] = useState("");
  const [error, setError] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("pharmacy.receive_stock", isOnline());
      return api("/medicine-batches/", {
        method: "POST",
        body: JSON.stringify({
          medicine: medicineId,
          batch_number: batchNumber,
          expiry_date: expiryDate,
          initial_quantity: Number(quantity),
          supplier: supplier || undefined,
        }),
      });
    },
    onSuccess: async () => {
      setBatchNumber("");
      setExpiryDate("");
      setQuantity("");
      setSupplier("");
      setError(null);
      toast.success("Stock received.");
      await queryClient.invalidateQueries({ queryKey: ["medicine-batches"] });
      await queryClient.invalidateQueries({ queryKey: ["medicines"] });
    },
    onError: (caught) => setError(caught),
  });

  if (!account || !allowed(account.permissions, "pharmacy.manage")) {
    return null;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (
      !validateForm(
        receiveStockSchema,
        { batch_number: batchNumber, expiry_date: expiryDate, initial_quantity: quantity, supplier },
        setError,
      )
    ) {
      return;
    }
    mutation.mutate();
  }

  return (
    <form className="grid gap-4 rounded-xl border bg-card p-4 shadow-premium-sm md:grid-cols-2" onSubmit={onSubmit}>
      <p className="text-sm font-medium md:col-span-2">Receive stock</p>
      <div className="space-y-2">
        <Label htmlFor="batch_number">Batch number</Label>
        <Input id="batch_number" value={batchNumber} required onChange={(event) => setBatchNumber(event.target.value)} />
        <FormFieldError error={error} name="batch_number" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="expiry_date">Expiry date</Label>
        <Input id="expiry_date" type="date" value={expiryDate} required onChange={(event) => setExpiryDate(event.target.value)} />
        <FormFieldError error={error} name="expiry_date" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="initial_quantity">Quantity</Label>
        <Input id="initial_quantity" inputMode="numeric" value={quantity} required onChange={(event) => setQuantity(event.target.value)} />
        <FormFieldError error={error} name="initial_quantity" />
      </div>
      <SupplierSelect id="batch_supplier" value={supplier} onValueChange={setSupplier} optional />
      <div className="md:col-span-2">
        <Button type="submit" size="sm" disabled={mutation.isPending}>
          {mutation.isPending ? "Receiving…" : "Receive stock"}
        </Button>
      </div>
      <div className="md:col-span-2">
        <FormFieldError error={error} name="branch" />
        <FormError error={error} />
      </div>
    </form>
  );
}

export function EditMedicineForm({ medicine }: { medicine: Medicine }) {
  const { account } = useAuth();
  const queryClient = useQueryClient();
  const [category, setCategory] = useState(medicine.category);
  const [name, setName] = useState(medicine.name);
  const [form, setForm] = useState(medicine.form);
  const [strength, setStrength] = useState(medicine.strength);
  const [unit, setUnit] = useState(medicine.unit);
  const [reorderLevel, setReorderLevel] = useState(String(medicine.reorder_level));
  const [isActive, setIsActive] = useState(medicine.is_active);
  const [error, setError] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("pharmacy.edit_medicine", isOnline());
      return api<Medicine>(`/medicines/${medicine.id}/`, {
        method: "PATCH",
        body: JSON.stringify({
          category,
          name,
          form,
          strength,
          unit,
          reorder_level: Number(reorderLevel),
          is_active: isActive,
        }),
      });
    },
    onSuccess: async () => {
      setError(null);
      toast.success("Medicine updated.");
      await queryClient.invalidateQueries({ queryKey: ["medicines"] });
    },
    onError: (caught) => setError(caught),
  });

  if (!account || !allowed(account.permissions, "pharmacy.manage")) {
    return null;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (
      !validateForm(
        medicineEditSchema,
        { category, name, form, strength, unit, reorder_level: reorderLevel, is_active: isActive },
        setError,
      )
    ) {
      return;
    }
    mutation.mutate();
  }

  return (
    <form className="grid gap-4 rounded-xl border bg-card p-4 shadow-premium-sm md:grid-cols-2" onSubmit={onSubmit}>
      <p className="text-sm font-medium md:col-span-2">Edit catalog entry</p>
      <CategorySelect id="edit_medicine_category" value={category} onValueChange={setCategory} />
      <div className="space-y-2">
        <Label htmlFor="edit_medicine_name">Name</Label>
        <Input id="edit_medicine_name" value={name} required onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit_medicine_code">Code</Label>
        <Input id="edit_medicine_code" value={medicine.code} readOnly disabled />
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit_medicine_strength">Strength</Label>
        <Input id="edit_medicine_strength" value={strength} required onChange={(event) => setStrength(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit_medicine_form">Form</Label>
        <Select value={form} onValueChange={setForm}>
          <SelectTrigger id="edit_medicine_form" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {medicineForms.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit_medicine_unit">Unit</Label>
        <Select value={unit} onValueChange={setUnit}>
          <SelectTrigger id="edit_medicine_unit" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {medicineUnits.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit_medicine_reorder">Reorder level</Label>
        <Input
          id="edit_medicine_reorder"
          inputMode="numeric"
          value={reorderLevel}
          onChange={(event) => setReorderLevel(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit_medicine_active">Status</Label>
        <Select value={isActive ? "active" : "inactive"} onValueChange={(value) => setIsActive(value === "active")}>
          <SelectTrigger id="edit_medicine_active" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="md:col-span-2">
        <Button type="submit" size="sm" disabled={mutation.isPending || !category}>
          {mutation.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
      <div className="md:col-span-2">
        <FormFieldError error={error} name="category" />
        <FormError error={error} />
      </div>
    </form>
  );
}

export function CreateCategoryForm() {
  const { account } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("pharmacy.create_category", isOnline());
      return api<MedicineCategory>("/medicine-categories/", {
        method: "POST",
        body: JSON.stringify({ name, code }),
      });
    },
    onSuccess: async () => {
      setName("");
      setCode("");
      setError(null);
      toast.success("Category created.");
      await queryClient.invalidateQueries({ queryKey: ["medicine-categories"] });
    },
    onError: (caught) => setError(caught),
  });

  if (!account || !allowed(account.permissions, "pharmacy.manage")) {
    return null;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!validateForm(catalogCreateSchema, { name, code }, setError)) {
      return;
    }
    mutation.mutate();
  }

  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
      <div className="space-y-2">
        <Label htmlFor="category_name">Name</Label>
        <Input id="category_name" value={name} required onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="category_code">Code</Label>
        <Input id="category_code" value={code} required onChange={(event) => setCode(event.target.value)} />
        <FormFieldError error={error} name="code" />
      </div>
      <div className="md:col-span-2">
        <Button type="submit" size="sm" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Create category"}
        </Button>
      </div>
      <div className="md:col-span-2">
        <FormError error={error} />
      </div>
    </form>
  );
}

export function EditCatalogNameForm({
  label,
  resource,
  pathPrefix,
  items,
}: {
  label: string;
  resource: string;
  pathPrefix: string;
  items: Array<{ id: string; name: string }> | undefined;
}) {
  const { account } = useAuth();
  const queryClient = useQueryClient();
  const [itemId, setItemId] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation(`${resource}.rename`, isOnline());
      return api(`${pathPrefix}${itemId}/`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
    },
    onSuccess: async () => {
      setError(null);
      toast.success(`${label} updated.`);
      await queryClient.invalidateQueries({ queryKey: [resource] });
    },
    onError: (caught) => setError(caught),
  });

  useEffect(() => {
    const item = items?.find((row) => row.id === itemId);
    setName(item?.name ?? "");
  }, [itemId, items]);

  if (!account || !allowed(account.permissions, "pharmacy.manage")) {
    return null;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!validateForm(catalogRenameSchema, { itemId, name }, setError)) {
      return;
    }
    mutation.mutate();
  }

  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
      <div className="space-y-2">
        <Label htmlFor={`${resource}_edit_item`}>{label}</Label>
        <Select value={itemId} onValueChange={setItemId}>
          <SelectTrigger id={`${resource}_edit_item`} className="w-full">
            <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent>
            {items?.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${resource}_edit_name`}>Name</Label>
        <Input
          id={`${resource}_edit_name`}
          value={name}
          required
          disabled={!itemId}
          onChange={(event) => setName(event.target.value)}
        />
        <FormFieldError error={error} name="name" />
      </div>
      <div className="md:col-span-2">
        <Button type="submit" size="sm" disabled={mutation.isPending || !itemId}>
          {mutation.isPending ? "Saving…" : `Rename ${label.toLowerCase()}`}
        </Button>
      </div>
      <div className="md:col-span-2">
        <FormError error={error} />
      </div>
    </form>
  );
}

export function CreateSupplierForm() {
  const { account } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("pharmacy.create_supplier", isOnline());
      return api<Supplier>("/suppliers/", {
        method: "POST",
        body: JSON.stringify({ name, code }),
      });
    },
    onSuccess: async () => {
      setName("");
      setCode("");
      setError(null);
      toast.success("Supplier created.");
      await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (caught) => setError(caught),
  });

  if (!account || !allowed(account.permissions, "pharmacy.manage")) {
    return null;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!validateForm(catalogCreateSchema, { name, code }, setError)) {
      return;
    }
    mutation.mutate();
  }

  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
      <div className="space-y-2">
        <Label htmlFor="supplier_name">Name</Label>
        <Input id="supplier_name" value={name} required onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="supplier_code">Code</Label>
        <Input id="supplier_code" value={code} required onChange={(event) => setCode(event.target.value)} />
        <FormFieldError error={error} name="code" />
      </div>
      <div className="md:col-span-2">
        <Button type="submit" size="sm" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Create supplier"}
        </Button>
      </div>
      <div className="md:col-span-2">
        <FormError error={error} />
      </div>
    </form>
  );
}

function invalidateStockQueries(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["medicine-batches"] }),
    queryClient.invalidateQueries({ queryKey: ["medicines"] }),
    queryClient.invalidateQueries({ queryKey: ["stock-transactions"] }),
  ]);
}

export function AddStockToBatchForm({ medicineId }: { medicineId: string }) {
  const { account } = useAuth();
  const queryClient = useQueryClient();
  const [batch, setBatch] = useState("");
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("pharmacy.stock_in", isOnline());
      return api("/stock-transactions/", {
        method: "POST",
        body: JSON.stringify({
          batch,
          kind: "stock_in",
          quantity: Number(quantity),
        }),
      });
    },
    onSuccess: async () => {
      setBatch("");
      setQuantity("");
      setError(null);
      toast.success("Stock added to batch.");
      await invalidateStockQueries(queryClient);
    },
    onError: (caught) => setError(caught),
  });

  if (!account || !allowed(account.permissions, "pharmacy.manage")) {
    return null;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!validateForm(addStockToBatchSchema, { batch, quantity }, setError)) {
      return;
    }
    mutation.mutate();
  }

  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
      <BatchSelect id="stock_in_batch" medicineId={medicineId} value={batch} onValueChange={setBatch} />
      <div className="space-y-2">
        <Label htmlFor="stock_in_quantity">Quantity</Label>
        <Input
          id="stock_in_quantity"
          inputMode="numeric"
          value={quantity}
          required
          onChange={(event) => setQuantity(event.target.value)}
        />
        <FormFieldError error={error} name="quantity" />
      </div>
      <div className="md:col-span-2">
        <Button type="submit" size="sm" disabled={mutation.isPending || !batch}>
          {mutation.isPending ? "Adding…" : "Add stock"}
        </Button>
      </div>
      <div className="md:col-span-2">
        <FormFieldError error={error} name="batch" />
        <FormError error={error} />
      </div>
    </form>
  );
}

export function StockOutForm({ medicineId }: { medicineId: string }) {
  const { account } = useAuth();
  const queryClient = useQueryClient();
  const [batch, setBatch] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState<string>(stockOutReasons[0]);
  const [error, setError] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("pharmacy.stock_out", isOnline());
      return api("/stock-transactions/", {
        method: "POST",
        body: JSON.stringify({
          batch,
          kind: "adjustment",
          direction: "out",
          quantity: Number(quantity),
          reason,
        }),
      });
    },
    onSuccess: async () => {
      setBatch("");
      setQuantity("");
      setReason(stockOutReasons[0]);
      setError(null);
      toast.success("Stock removed.");
      await invalidateStockQueries(queryClient);
    },
    onError: (caught) => setError(caught),
  });

  if (!account || !allowed(account.permissions, "pharmacy.manage")) {
    return null;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!validateForm(stockOutSchema, { batch, quantity, reason }, setError)) {
      return;
    }
    mutation.mutate();
  }

  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
      <BatchSelect id="stock_out_batch" medicineId={medicineId} value={batch} onValueChange={setBatch} />
      <div className="space-y-2">
        <Label htmlFor="stock_out_quantity">Quantity</Label>
        <Input
          id="stock_out_quantity"
          inputMode="numeric"
          value={quantity}
          required
          onChange={(event) => setQuantity(event.target.value)}
        />
        <FormFieldError error={error} name="quantity" />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="stock_out_reason">Reason</Label>
        <Select value={reason} onValueChange={setReason}>
          <SelectTrigger id="stock_out_reason" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {stockOutReasons.map((option) => (
              <SelectItem key={option} value={option}>
                {formatStockReason(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FormFieldError error={error} name="reason" />
      </div>
      <div className="md:col-span-2">
        <Button type="submit" size="sm" disabled={mutation.isPending || !batch}>
          {mutation.isPending ? "Removing…" : "Remove stock"}
        </Button>
      </div>
      <div className="md:col-span-2">
        <FormFieldError error={error} name="batch" />
        <FormError error={error} />
      </div>
    </form>
  );
}

export function StockOperationsPanel({ medicineId }: { medicineId: string }) {
  const { account } = useAuth();
  if (!account || !allowed(account.permissions, "pharmacy.manage")) {
    return null;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="space-y-3 rounded-xl border bg-card p-4 shadow-premium-sm">
        <div>
          <p className="text-sm font-medium">Stock in</p>
          <p className="text-xs text-muted-foreground">Add units to an existing batch.</p>
        </div>
        <AddStockToBatchForm medicineId={medicineId} />
      </div>
      <div className="space-y-3 rounded-xl border bg-card p-4 shadow-premium-sm">
        <div>
          <p className="text-sm font-medium">Stock out</p>
          <p className="text-xs text-muted-foreground">Remove damaged, expired, or wasted units.</p>
        </div>
        <StockOutForm medicineId={medicineId} />
      </div>
      <div className="space-y-3 rounded-xl border bg-card p-4 shadow-premium-sm">
        <div>
          <p className="text-sm font-medium">Adjustment</p>
          <p className="text-xs text-muted-foreground">Correct counts after a physical inventory check.</p>
        </div>
        <AdjustStockForm medicineId={medicineId} embedded />
      </div>
    </div>
  );
}

export function AdjustStockForm({ medicineId, embedded = false }: { medicineId: string; embedded?: boolean }) {
  const { account } = useAuth();
  const queryClient = useQueryClient();
  const [batch, setBatch] = useState("");
  const [direction, setDirection] = useState<"in" | "out">("out");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState<string>(stockAdjustmentReasons[2]);
  const [error, setError] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("pharmacy.adjust_stock", isOnline());
      return api("/stock-transactions/", {
        method: "POST",
        body: JSON.stringify({
          batch,
          kind: "adjustment",
          direction,
          quantity: Number(quantity),
          reason,
        }),
      });
    },
    onSuccess: async () => {
      setBatch("");
      setQuantity("");
      setReason(stockAdjustmentReasons[2]);
      setError(null);
      toast.success("Stock adjusted.");
      await invalidateStockQueries(queryClient);
    },
    onError: (caught) => setError(caught),
  });

  if (!account || !allowed(account.permissions, "pharmacy.manage")) {
    return null;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!validateForm(adjustStockSchema, { batch, direction, quantity, reason }, setError)) {
      return;
    }
    mutation.mutate();
  }

  return (
    <form
      className={embedded ? "grid gap-4 md:grid-cols-2" : "grid gap-4 rounded-xl border bg-card p-4 shadow-premium-sm md:grid-cols-2"}
      onSubmit={onSubmit}
    >
      {!embedded ? <p className="text-sm font-medium md:col-span-2">Adjust stock</p> : null}
      <BatchSelect id="adjust_batch" medicineId={medicineId} value={batch} onValueChange={setBatch} />
      <div className="space-y-2">
        <Label htmlFor="adjust_direction">Direction</Label>
        <Select value={direction} onValueChange={(value) => setDirection(value as "in" | "out")}>
          <SelectTrigger id="adjust_direction" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="in">Increase</SelectItem>
            <SelectItem value="out">Decrease</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="adjust_quantity">Quantity</Label>
        <Input id="adjust_quantity" inputMode="numeric" value={quantity} required onChange={(event) => setQuantity(event.target.value)} />
        <FormFieldError error={error} name="quantity" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="adjust_reason">Reason</Label>
        <Select value={reason} onValueChange={setReason}>
          <SelectTrigger id="adjust_reason" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {stockAdjustmentReasons.map((option) => (
              <SelectItem key={option} value={option}>
                {formatStockReason(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FormFieldError error={error} name="reason" />
      </div>
      <div className="md:col-span-2">
        <Button type="submit" size="sm" disabled={mutation.isPending || !batch}>
          {mutation.isPending ? "Adjusting…" : "Apply adjustment"}
        </Button>
      </div>
      <div className="md:col-span-2">
        <FormFieldError error={error} name="batch" />
        <FormError error={error} />
      </div>
    </form>
  );
}

export function BatchActiveToggle({ batch }: { batch: MedicineBatch }) {
  const { account } = useAuth();
  if (!account || !allowed(account.permissions, "pharmacy.manage")) {
    return null;
  }
  return (
    <ToggleActiveButton
      path={`/medicine-batches/${batch.id}/`}
      active={batch.is_active}
      resource="medicine-batches"
      label="Batch"
    />
  );
}
