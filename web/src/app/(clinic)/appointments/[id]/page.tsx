import { AppointmentDetailScreen } from "@/features/appointments/appointment-detail-screen";

export default async function AppointmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AppointmentDetailScreen appointmentId={id} />;
}
