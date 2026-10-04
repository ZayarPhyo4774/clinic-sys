import { RecordList, RowText, StatusRow } from "@/components/record-list";
import { RequirePermission } from "@/features/access/guards";

type InvoiceRow = {
  id: string;
  invoice_number?: string;
  status?: string;
  total?: string;
};

export function BillingScreen() {
  return (
    <RequirePermission permission="billing.view" title="Billing">
      <RecordList<InvoiceRow>
        title="Invoices"
        resource="invoices"
        path="/invoices/"
        emptyLabel="invoices"
        renderItem={(row) => (
          <>
            <RowText label="Number" value={row.invoice_number || row.id} />
            <StatusRow value={row.status || "unknown"} />
            <RowText label="Total" value={row.total || "—"} />
          </>
        )}
      />
    </RequirePermission>
  );
}
