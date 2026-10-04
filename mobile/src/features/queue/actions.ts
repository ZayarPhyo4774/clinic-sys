export const queueActions = ["call", "start", "complete", "skip", "requeue"] as const;

export type QueueAction = (typeof queueActions)[number];
