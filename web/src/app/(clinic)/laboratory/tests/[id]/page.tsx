import { LabTestDetailScreen } from "@/features/laboratory/lab-test-detail-screen";

export default async function LabTestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LabTestDetailScreen testId={id} />;
}
