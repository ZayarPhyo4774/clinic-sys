"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

import { FormError, FormFieldError } from "@/components/form-field-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { allowed } from "@/features/access/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import { api } from "@/lib/api/client";
import type { PaymentMethod } from "@/lib/api/types";
import { paymentMethodSchema, validateForm } from "@/lib/forms/schemas";
import { isOnline } from "@/offline/connectivity/network";
import { requireOnlineMutation } from "@/offline/sync/policy";

export function CreatePaymentMethodForm() {
  const { account } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("payment_methods.create", isOnline());
      return api<PaymentMethod>("/payment-methods/", {
        method: "POST",
        body: JSON.stringify({ name, code }),
      });
    },
    onSuccess: async () => {
      setName("");
      setCode("");
      setError(null);
      toast.success("Payment method created.");
      await queryClient.invalidateQueries({ queryKey: ["payment-methods"] });
    },
    onError: (caught) => setError(caught),
  });

  if (!account || !allowed(account.permissions, "billing.create")) {
    return null;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!validateForm(paymentMethodSchema, { name, code }, setError)) {
      return;
    }
    mutation.mutate();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment methods</CardTitle>
        <CardDescription>Configure methods available when recording payments.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="pay_method_name">Name</Label>
            <Input id="pay_method_name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pay_method_code">Code</Label>
            <Input id="pay_method_code" value={code} onChange={(event) => setCode(event.target.value)} />
            <FormFieldError error={error} name="code" />
          </div>
          <div className="md:col-span-2">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Add payment method"}
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
