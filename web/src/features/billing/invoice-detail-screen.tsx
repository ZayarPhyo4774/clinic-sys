"use client";

import { StatusText } from "@/components/record-browser";
import { DetailField, DetailGrid, DetailSection, DetailTable } from "@/components/detail-fields";
import { DetailLayout } from "@/components/detail-layout";
import { DetailPageState } from "@/components/detail-page-state";
import { PrintRecordButton } from "@/components/print/print-record-button";
import { DoctorLabel, RecordLink } from "@/components/record-link";
import { RequirePermission } from "@/features/access/require-permission";
import { useBillingLookups } from "@/features/billing/billing-lookups";
import { formatMoney, formatInvoiceKind, invoiceLineTotal } from "@/features/billing/billing-utils";
import { InvoiceWritePanel } from "@/features/billing/billing-writes";
import { useDetailQuery, useRelatedListQuery } from "@/hooks/use-detail-query";
import type { Invoice, Payment } from "@/lib/api/types";
import { formatWhen } from "@/lib/utils";

export function InvoiceDetailScreen({ invoiceId }: { invoiceId: string }) {
  return (
    <RequirePermission permission="billing.view" title="Invoice">
      <InvoiceDetail invoiceId={invoiceId} />
    </RequirePermission>
  );
}

function InvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const { resolvePatientName, resolvePaymentMethodName } = useBillingLookups();
  const query = useDetailQuery<Invoice>("invoices", `/invoices/${invoiceId}/`);
  const paymentsQuery = useRelatedListQuery<Payment>("payments", `/invoices/${invoiceId}/payments/`);

  const state = (
    <DetailPageState
      title="Invoice"
      isLoading={query.isLoading}
      error={query.error}
      onRetry={() => void query.refetch()}
    />
  );

  if (query.isLoading || query.error || !query.data) {
    return state;
  }

  const invoice = query.data;

  return (
    <DetailLayout
      breadcrumbs={[
        { label: "Dashboard", href: "/" },
        { label: "Billing", href: "/billing" },
        { label: invoice.invoice_number || invoice.id },
      ]}
      title={invoice.invoice_number || "Invoice"}
      description={formatMoney(invoice.currency, invoice.total)}
      actions={
        <PrintRecordButton href={`/billing/${invoiceId}/print`} label="Print invoice" />
      }
    >
      <InvoiceWritePanel
        invoice={invoice}
        onUpdated={() => {
          void query.refetch();
          void paymentsQuery.refetch();
        }}
      />

      <DetailSection title="Summary">
        <DetailGrid>
          <DetailField label="Status" value={<StatusText value={invoice.status} />} />
          <DetailField label="Issued" value={invoice.issued_at ? formatWhen(invoice.issued_at) : "Draft"} />
          <DetailField
            label="Patient"
            value={
              <RecordLink href={`/patients/${invoice.patient}`}>
                {resolvePatientName(invoice.patient, invoice.patient_full_name)}
              </RecordLink>
            }
          />
          <DetailField
            label="Doctor"
            value={<DoctorLabel id={invoice.doctor} fullName={invoice.doctor_full_name} />}
          />
          <DetailField
            label="Encounter"
            value={
              invoice.encounter ? (
                <RecordLink href={`/consultation/${invoice.encounter}`}>Open consultation</RecordLink>
              ) : (
                "Manual invoice"
              )
            }
          />
          <DetailField label="Subtotal" value={formatMoney(invoice.currency, invoice.subtotal)} />
          <DetailField label="Discount" value={formatMoney(invoice.currency, invoice.discount_total)} />
          <DetailField label="Tax" value={formatMoney(invoice.currency, invoice.tax_amount)} />
          <DetailField label="Total" value={formatMoney(invoice.currency, invoice.total)} />
          <DetailField
            label="Balance"
            value={
              <span className={Number(invoice.balance) > 0 ? "font-semibold text-destructive" : undefined}>
                {formatMoney(invoice.currency, invoice.balance)}
              </span>
            }
          />
        </DetailGrid>
      </DetailSection>

      <DetailSection title="Line items">
        <DetailTable
          emptyLabel="No line items."
          rows={invoice.items}
          columns={[
            { key: "kind", header: "Kind", cell: (row) => formatInvoiceKind(String(row.kind)) },
            { key: "description", header: "Description", cell: (row) => String(row.description) },
            { key: "quantity", header: "Qty", cell: (row) => String(row.quantity) },
            {
              key: "unit_price",
              header: "Unit price",
              cell: (row) => formatMoney(invoice.currency, String(row.unit_price)),
            },
            {
              key: "discount",
              header: "Discount",
              cell: (row) => formatMoney(invoice.currency, String(row.discount_amount)),
            },
            {
              key: "line_total",
              header: "Line total",
              cell: (row) => formatMoney(invoice.currency, invoiceLineTotal(row)),
            },
          ]}
        />
      </DetailSection>

      <DetailSection title="Payments">
        <DetailTable
          emptyLabel="No payments recorded."
          rows={paymentsQuery.data ?? []}
          columns={[
            {
              key: "method",
              header: "Method",
              cell: (row) => resolvePaymentMethodName(row.method, row.method_name),
            },
            {
              key: "amount",
              header: "Amount",
              cell: (row) => formatMoney(invoice.currency, row.amount),
            },
            { key: "paid_at", header: "Paid", cell: (row) => formatWhen(String(row.paid_at)) },
          ]}
        />
      </DetailSection>
    </DetailLayout>
  );
}
