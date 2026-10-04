import { ConsultationScreen } from "@/features/consultation/consultation-screen";

export default async function ConsultationPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string }>;
}) {
  const { patient } = await searchParams;
  return <ConsultationScreen patientId={patient} />;
}
