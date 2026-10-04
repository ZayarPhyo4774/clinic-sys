import { MedicineDetailScreen } from "@/features/pharmacy/medicine-detail-screen";

export default async function MedicineDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MedicineDetailScreen medicineId={id} />;
}
