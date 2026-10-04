import { ConsultationPrintScreen } from "@/features/consultation/consultation-print-screen";

export default async function ConsultationPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ auto?: string }>;
}) {
  const { id } = await params;
  const { auto } = await searchParams;
  return <ConsultationPrintScreen encounterId={id} autoPrint={auto === "1"} />;
}
