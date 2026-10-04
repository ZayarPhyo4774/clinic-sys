import { PrescriptionDetailScreen } from "@/features/prescriptions/prescription-detail-screen";

export default async function PrescriptionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PrescriptionDetailScreen prescriptionId={id} />;
}
