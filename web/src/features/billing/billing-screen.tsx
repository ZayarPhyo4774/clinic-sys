"use client";

import Link from "next/link";
import { useState } from "react";

import { PageHeader } from "@/components/page-header";
import { RecordBrowser, StatusText } from "@/components/record-browser";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RequirePermission } from "@/features/access/require-permission";
import { useBillingLookups } from "@/features/billing/billing-lookups";
import { formatMoney } from "@/features/billing/billing-utils";
import { CreateManualInvoiceForm } from "@/features/billing/create-manual-invoice";
import { CreatePaymentMethodForm } from "@/features/billing/payment-method-writes";
import type { Invoice } from "@/lib/api/types";
import { formatWhen } from "@/lib/utils";

const statusFilters = [
  { value: "__all__", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "issued", label: "Issued" },
  { value: "partially_paid", label: "Partially paid" },
  { value: "paid", label: "Paid" },
  { value: "open", label: "Awaiting payment" },
] as const;

export function BillingScreen() {
  const [status, setStatus] = useState<(typeof statusFilters)[number]["value"]>("__all__");
  const { resolvePatientName } = useBillingLookups();

  return (
    <RequirePermission permission="billing.view" title="Billing">
      <section className="space-y-8">
        <PageHeader
          eyebrow="Operations"
          title="Billing"
          description="Issue invoices, record payments, and print receipts for patient visits."
        />

        <CreateManualInvoiceForm />

        <RecordBrowser<Invoice>
          title="Invoices"
          resource="invoices"
          path="/invoices/"
          emptyLabel="invoices"
          listParams={{
            status: status !== "__all__" && status !== "open" ? status : undefined,
            open_for_payment: status === "open" ? "true" : undefined,
          }}
          toolbar={
            <div className="space-y-2">
              <Label htmlFor="invoice_status">Status</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
                <SelectTrigger id="invoice_status" className="w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusFilters.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          }
          rowHref={(row) => `/billing/${row.id}`}
          columns={[
            {
              key: "number",
              header: "Invoice",
              cell: (row) => (
                <div>
                  <p className="font-medium">{row.invoice_number || row.id}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.issued_at ? formatWhen(row.issued_at) : formatWhen(row.created_at)}
                  </p>
                </div>
              ),
            },
            {
              key: "patient",
              header: "Patient",
              cell: (row) => (
                <Link href={`/patients/${row.patient}`} className="hover:underline" onClick={(event) => event.stopPropagation()}>
                  {resolvePatientName(row.patient, row.patient_full_name)}
                </Link>
              ),
            },
            {
              key: "doctor",
              header: "Doctor",
              cell: (row) => row.doctor_full_name ?? "—",
            },
            { key: "status", header: "Status", cell: (row) => <StatusText value={row.status} /> },
            {
              key: "total",
              header: "Total",
              cell: (row) => formatMoney(row.currency, row.total),
            },
            {
              key: "balance",
              header: "Balance",
              cell: (row) => (
                <span className={Number(row.balance) > 0 ? "font-medium text-destructive" : "text-muted-foreground"}>
                  {formatMoney(row.currency, row.balance)}
                </span>
              ),
            },
          ]}
        />

        <Card className="shadow-premium-sm">
          <CardHeader>
            <CardTitle>Payment methods</CardTitle>
            <CardDescription>Add cash, card, or other methods used when recording payments.</CardDescription>
          </CardHeader>
          <CardContent>
            <CreatePaymentMethodForm />
          </CardContent>
        </Card>
      </section>
    </RequirePermission>
  );
}
