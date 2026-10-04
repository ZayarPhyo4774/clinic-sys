import { StaffDetailScreen } from "@/features/organization/staff-detail-screen";

export default async function StaffDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StaffDetailScreen staffId={id} />;
}
