"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { allowed } from "@/features/access/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import {
  canOpenTriage,
  queueActionLabels,
  queueActionsForRole,
  queueActionsNeedConfirm,
  type QueueAction,
} from "@/features/queue/actions";
import { refreshQueueQueries } from "@/features/queue/queue-cache";
import { api } from "@/lib/api/client";
import type { QueueEntry } from "@/lib/api/types";
import { isOnline } from "@/offline/connectivity/network";
import { requireOnlineMutation } from "@/offline/sync/policy";

export function QueueActions({ entry, compact = false }: { entry: QueueEntry; compact?: boolean }) {
  const { account } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<QueueAction | null>(null);
  const permissions = account?.permissions ?? [];
  const actions = queueActionsForRole(entry.status, permissions);
  const showTriage = canOpenTriage(entry, permissions);
  const canOpenConsultation = Boolean(
    account &&
      allowed(account.permissions, "encounters.view") &&
      entry.encounter &&
      (entry.status === "in_service" || entry.appointment_status === "in_consultation"),
  );

  const mutation = useMutation({
    mutationFn: (action: QueueAction) => {
      requireOnlineMutation(`queue.${action}`, isOnline());
      return api<QueueEntry>(`/queue-entries/${entry.id}/${action}/`, { method: "POST", body: "{}" });
    },
    onSuccess: async (data, action) => {
      setMessage(null);
      setConfirmAction(null);
      toast.success(queueActionLabels[action]);
      await refreshQueueQueries(queryClient);
      await queryClient.invalidateQueries({ queryKey: ["appointments"] });
      await queryClient.invalidateQueries({ queryKey: ["encounters"] });
      if (action === "start" && data.encounter) {
        router.push(`/consultation/${data.encounter}`);
      }
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : "The queue action was rejected.");
    },
  });

  if (actions.length === 0 && !showTriage && !canOpenConsultation) {
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
        {showTriage ? (
          <Button asChild size="sm" variant="outline">
            <Link href={`/triage/${entry.id}`}>Record vitals</Link>
          </Button>
        ) : null}
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
        {canOpenConsultation && entry.encounter ? (
          <Button asChild size="sm" variant={entry.status === "in_service" ? "default" : "outline"}>
            <Link href={`/consultation/${entry.encounter}`}>Open consultation</Link>
          </Button>
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
