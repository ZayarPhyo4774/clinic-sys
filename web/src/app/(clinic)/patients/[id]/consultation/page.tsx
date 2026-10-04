import { PatientConsultationRedirect } from "@/features/consultation/patient-consultation-redirect";

export default async function PatientConsultationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PatientConsultationRedirect patientId={id} />;
}
