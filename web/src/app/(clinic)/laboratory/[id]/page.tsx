import { LabOrderDetailScreen } from "@/features/laboratory/lab-order-detail-screen";

export default async function LabOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LabOrderDetailScreen orderId={id} />;
}
