"use client";

import { DetailPageState } from "@/components/detail-page-state";
import {
  PrintDocument,
  PrintHeader,
  PrintMetaGrid,
  PrintSection,
  PrintTable,
  PrintToolbar,
} from "@/components/print/print-document";
import { useBillingLookups } from "@/features/billing/billing-lookups";
import { formatMoney, formatInvoiceKind, invoiceLineTotal } from "@/features/billing/billing-utils";
import { RequirePermission } from "@/features/access/require-permission";
import { useAuth } from "@/features/auth/auth-provider";
import { formatSex, patientAge } from "@/features/consultation/consultation-chart";
import { useDetailQuery, useRelatedListQuery } from "@/hooks/use-detail-query";
import type { Invoice, Patient, Payment } from "@/lib/api/types";
import { formatWhen } from "@/lib/utils";

export function InvoicePrintScreen({
  invoiceId,
  autoPrint = false,
}: {
  invoiceId: string;
  autoPrint?: boolean;
}) {
  return (
    <RequirePermission permission="billing.view" title="Invoice">
      <InvoicePrint invoiceId={invoiceId} autoPrint={autoPrint} />
    </RequirePermission>
  );
}

function InvoicePrint({ invoiceId, autoPrint }: { invoiceId: string; autoPrint: boolean }) {
  const { account, branchId } = useAuth();
  const { resolvePatientName, resolvePaymentMethodName } = useBillingLookups();
  const query = useDetailQuery<Invoice>("invoices", `/invoices/${invoiceId}/`);
  const paymentsQuery = useRelatedListQuery<Payment>("payments", `/invoices/${invoiceId}/payments/`);
  const patientQuery = useDetailQuery<Patient>("patients", query.data ? `/patients/${query.data.patient}/` : null);

  const loading = query.isLoading || paymentsQuery.isLoading || patientQuery.isLoading;
  const error = query.error ?? paymentsQuery.error ?? patientQuery.error;

  const branchName =
    account?.assigned_branches.find((branch) => branch.id === branchId)?.name ?? "Clinic";

  if (loading || error || !query.data) {
    return (
      <>
        <PrintToolbar
          backHref={`/billing/${invoiceId}`}
          backLabel="Back to invoice"
          title="Invoice"
          autoPrint={autoPrint}
          ready={false}
        />
        <DetailPageState
          title="Invoice"
          isLoading={loading}
          error={error}
          onRetry={() => {
            void query.refetch();
            void paymentsQuery.refetch();
            void patientQuery.refetch();
          }}
        />
      </>
    );
  }

  const invoice = query.data;
  const patient = patientQuery.data;
  const payments = paymentsQuery.data ?? [];
  const paidTotal = payments.reduce((sum, row) => sum + Number(row.amount), 0);
  const age = patient ? patientAge(patient.date_of_birth) : null;

  return (
    <>
      <PrintToolbar
        backHref={`/billing/${invoiceId}`}
        backLabel="Back to invoice"
        title="Invoice"
        autoPrint={autoPrint}
        ready
      />
      <PrintDocument>
        <PrintHeader
          clinicName={branchName}
          documentTitle="Tax Invoice"
          documentRef={invoice.invoice_number || invoice.id}
        />

        <PrintSection title="Invoice details">
          <PrintMetaGrid
            rows={[
              { label: "Invoice No.", value: invoice.invoice_number || "—" },
              { label: "Status", value: invoice.status.replace(/_/g, " ") },
              { label: "Issued", value: invoice.issued_at ? formatWhen(invoice.issued_at) : "Draft" },
              { label: "Created", value: formatWhen(invoice.created_at) },
            ]}
          />
        </PrintSection>

        <PrintSection title="Patient">
          <PrintMetaGrid
            rows={[
              {
                label: "Name",
                value: resolvePatientName(
                  invoice.patient,
                  patient?.full_name ?? invoice.patient_full_name,
                ),
              },
              { label: "Patient No.", value: patient?.patient_number ?? "—" },
              {
                label: "Age / Sex",
                value: patient ? `${age ?? "—"} years · ${formatSex(patient.sex)}` : "—",
              },
            ]}
          />
        </PrintSection>

        <PrintSection title="Provider">
          <PrintMetaGrid
            rows={[
              { label: "Doctor", value: invoice.doctor_full_name?.trim() || "—" },
            ]}
          />
        </PrintSection>

        <PrintSection title="Line items">
          <PrintTable
            compact
            headers={["Description", "Kind", "Qty", "Unit price", "Discount", "Line total"]}
            rows={invoice.items.map((item) => [
              item.description || "—",
              formatInvoiceKind(item.kind),
              item.quantity,
              formatMoney(invoice.currency, item.unit_price),
              formatMoney(invoice.currency, item.discount_amount),
              formatMoney(invoice.currency, invoiceLineTotal(item)),
            ])}
          />
        </PrintSection>

        <PrintSection title="Totals">
          <PrintMetaGrid
            rows={[
              { label: "Subtotal", value: formatMoney(invoice.currency, invoice.subtotal) },
              { label: "Discount", value: formatMoney(invoice.currency, invoice.discount_total) },
              { label: "Tax", value: formatMoney(invoice.currency, invoice.tax_amount) },
              { label: "Total", value: formatMoney(invoice.currency, invoice.total) },
              { label: "Paid", value: formatMoney(invoice.currency, paidTotal) },
              { label: "Balance due", value: formatMoney(invoice.currency, invoice.balance) },
            ]}
          />
        </PrintSection>

        {payments.length > 0 ? (
          <PrintSection title="Payments">
            <PrintTable
              compact
              headers={["When", "Method", "Amount"]}
              rows={payments.map((payment) => [
                formatWhen(payment.paid_at),
                resolvePaymentMethodName(payment.method, payment.method_name),
                formatMoney(invoice.currency, payment.amount),
              ])}
            />
          </PrintSection>
        ) : null}
      </PrintDocument>
    </>
  );
}
