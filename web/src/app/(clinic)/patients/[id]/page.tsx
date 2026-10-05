import { PatientDetailScreen } from "@/features/patients/patient-detail-screen";

export default async function PatientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  return <PatientDetailScreen patientId={id} initialTab={tab} />;
}
