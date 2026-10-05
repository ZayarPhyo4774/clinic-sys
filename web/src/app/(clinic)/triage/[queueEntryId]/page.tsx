import { TriageScreen } from "@/features/triage/triage-screen";

export default async function TriagePage({ params }: { params: Promise<{ queueEntryId: string }> }) {
  const { queueEntryId } = await params;
  return <TriageScreen queueEntryId={queueEntryId} />;
}
