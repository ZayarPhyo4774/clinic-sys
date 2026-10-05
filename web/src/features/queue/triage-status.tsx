import { Badge } from "@/components/ui/badge";
import type { QueueEntry } from "@/lib/api/types";

export function triageBadgeVariant(entry: Pick<QueueEntry, "triage_started_at" | "vitals_recorded_at">) {
  if (entry.vitals_recorded_at) {
    return "success" as const;
  }
  if (entry.triage_started_at) {
    return "warning" as const;
  }
  return "default" as const;
}

export function triageStatusLabel(entry: Pick<QueueEntry, "triage_started_at" | "vitals_recorded_at">) {
  if (entry.vitals_recorded_at) {
    return "Vitals recorded";
  }
  if (entry.triage_started_at) {
    return "In triage";
  }
  return "Not started";
}

export function TriageStatusBadge({ entry }: { entry: Pick<QueueEntry, "triage_started_at" | "vitals_recorded_at"> }) {
  return <Badge variant={triageBadgeVariant(entry)}>{triageStatusLabel(entry)}</Badge>;
}
