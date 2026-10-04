import { PrescriptionPrintScreen } from "@/features/prescriptions/prescription-print-screen";

export default async function PrescriptionPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ auto?: string }>;
}) {
  const { id } = await params;
  const { auto } = await searchParams;
  return <PrescriptionPrintScreen prescriptionId={id} autoPrint={auto === "1"} />;
}
