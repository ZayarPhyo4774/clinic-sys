import { EncounterDetailScreen } from "@/features/consultation/encounter-detail-screen";

export default async function EncounterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EncounterDetailScreen encounterId={id} />;
}
