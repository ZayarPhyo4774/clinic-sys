"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { StartConsultationButton } from "@/features/consultation/start-consultation-button";
import {
  queueActionLabels,
  queueActionsForStatus,
  queueActionsNeedConfirm,
  type QueueAction,
} from "@/features/queue/actions";
import { api } from "@/lib/api/client";
import type { QueueEntry } from "@/lib/api/types";
import { isOnline } from "@/offline/connectivity/network";
import { requireOnlineMutation } from "@/offline/sync/policy";

export function QueueActions({
  entryId,
  status,
  appointmentId,
  appointmentStatus,
  compact = false,
}: {
  entryId: string;
  status: string;
  appointmentId?: string;
  appointmentStatus?: string;
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<QueueAction | null>(null);
  const actions = queueActionsForStatus(status);
  const mutation = useMutation({
    mutationFn: (action: QueueAction) => {
      requireOnlineMutation(`queue.${action}`, isOnline());
      return api<QueueEntry>(`/queue-entries/${entryId}/${action}/`, { method: "POST", body: "{}" });
    },
    onSuccess: async (_data, action) => {
      setMessage(null);
      setConfirmAction(null);
      toast.success(queueActionLabels[action]);
      await queryClient.invalidateQueries({ queryKey: ["queue"] });
      await queryClient.invalidateQueries({ queryKey: ["appointments"] });
      await queryClient.invalidateQueries({ queryKey: ["encounters"] });
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : "The queue action was rejected.");
    },
  });

  if (actions.length === 0) {
    return compact ? null : <span className="text-xs text-muted-foreground">No actions</span>;
  }

  function runAction(action: QueueAction) {
    setMessage(null);
    if (queueActionsNeedConfirm.includes(action)) {
      setConfirmAction(action);
      return;
    }
    mutation.mutate(action);
  }

  return (
    <div
      className={compact ? "flex flex-col gap-2" : "flex min-w-44 flex-col gap-2"}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button
            key={action}
            type="button"
            size="sm"
            variant={action === "start" || action === "call" ? "default" : "outline"}
            disabled={mutation.isPending}
            aria-label={queueActionLabels[action]}
            onClick={() => runAction(action)}
          >
            {queueActionLabels[action]}
          </Button>
        ))}
        {appointmentId && appointmentStatus ? (
          <StartConsultationButton
            appointmentId={appointmentId}
            appointmentStatus={appointmentStatus}
            size="sm"
            variant={status === "in_service" ? "default" : "outline"}
          />
        ) : null}
      </div>
      {message ? (
        <p role="alert" className="text-xs text-destructive">
          {message}
        </p>
      ) : null}
      <ConfirmDialog
        open={confirmAction === "skip"}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmAction(null);
          }
        }}
        title="Skip this patient?"
        description="The patient will leave the active queue. You can requeue them later if they return."
        confirmLabel="Skip patient"
        destructive
        pending={mutation.isPending}
        onConfirm={() => mutation.mutate("skip")}
      />
    </div>
  );
}
