export const queueActions = ["call", "start", "complete", "skip", "requeue"] as const;

export type QueueAction = (typeof queueActions)[number];

export const queueActionLabels: Record<QueueAction, string> = {
  call: "Call patient",
  start: "Start visit",
  complete: "Complete visit",
  skip: "Skip",
  requeue: "Requeue",
};

export const queueActionsNeedConfirm: QueueAction[] = ["skip"];

export function queueActionsForStatus(status: string): QueueAction[] {
  switch (status) {
    case "waiting":
      return ["call", "skip"];
    case "called":
      return ["start", "skip"];
    case "in_service":
      return ["complete"];
    case "skipped":
      return ["requeue"];
    default:
      return [];
  }
}
