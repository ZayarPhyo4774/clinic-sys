import { InvoiceDetailScreen } from "@/features/billing/invoice-detail-screen";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InvoiceDetailScreen invoiceId={id} />;
}
