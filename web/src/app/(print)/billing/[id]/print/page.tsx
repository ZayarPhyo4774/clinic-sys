import { InvoicePrintScreen } from "@/features/billing/invoice-print-screen";

export default async function InvoicePrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ auto?: string }>;
}) {
  const { id } = await params;
  const { auto } = await searchParams;
  return <InvoicePrintScreen invoiceId={id} autoPrint={auto === "1"} />;
}
