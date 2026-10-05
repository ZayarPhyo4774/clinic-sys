"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { DetailLayout } from "@/components/detail-layout";
import { DetailPageState } from "@/components/detail-page-state";
import { QueryState } from "@/components/query-state";
import { DoctorLabel, PatientLink } from "@/components/record-link";
import { Button } from "@/components/ui/button";
import { allowed } from "@/features/access/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import { patchQueueEntry, refreshQueueQueries } from "@/features/queue/queue-cache";
import { TriageStatusBadge } from "@/features/queue/triage-status";
import { VitalsForm } from "@/features/triage/vitals-form";
import { useDetailQuery } from "@/hooks/use-detail-query";
import { api } from "@/lib/api/client";
import type { QueueEntry, TriageStartResult } from "@/lib/api/types";
import { isOnline } from "@/offline/connectivity/network";
import { requireOnlineMutation } from "@/offline/sync/policy";

export function TriageScreen({ queueEntryId }: { queueEntryId: string }) {
  const { account, isLoading } = useAuth();

  if (isLoading) {
    return <QueryState status="loading" />;
  }

  if (
    !account ||
    (!allowed(account.permissions, "triage.start") && !allowed(account.permissions, "vitals.record"))
  ) {
    return <QueryState status="forbidden" title="Triage" />;
  }

  return <TriageDetail queueEntryId={queueEntryId} />;
}

function TriageDetail({ queueEntryId }: { queueEntryId: string }) {
  const { account } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const autoStarted = useRef(false);
  const query = useDetailQuery<QueueEntry>("queue", `/queue-entries/${queueEntryId}/`);
  const entry = query.data;

  const startTriage = useMutation({
    mutationFn: () => {
      requireOnlineMutation("triage.start", isOnline());
      return api<TriageStartResult>(`/queue-entries/${queueEntryId}/triage/start/`, {
        method: "POST",
        body: "{}",
      });
    },
    onSuccess: async (result) => {
      patchQueueEntry(queryClient, queueEntryId, {
        triage_started_at: result.queue_entry.triage_started_at,
        encounter: result.queue_entry.encounter,
      });
      await queryClient.invalidateQueries({ queryKey: ["encounters"] });
      await refreshQueueQueries(queryClient);
      await query.refetch();
    },
  });

  const canStartTriage = Boolean(
    account &&
      allowed(account.permissions, "triage.start") &&
      entry?.status === "waiting" &&
      !entry.encounter,
  );
  const canRecordVitals = Boolean(
    account && allowed(account.permissions, "vitals.record") && entry?.encounter,
  );

  useEffect(() => {
    if (!canStartTriage || autoStarted.current) {
      return;
    }
    autoStarted.current = true;
    startTriage.mutate();
  }, [canStartTriage]);

  if (query.isLoading || query.error || !entry) {
    return (
      <DetailPageState
        title="Triage"
        isLoading={query.isLoading}
        error={query.error ?? (!entry && !query.isLoading ? new Error("Queue entry not found.") : null)}
        onRetry={() => void query.refetch()}
      />
    );
  }

  if (entry.status !== "waiting") {
    return (
      <DetailLayout
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Queue", href: "/queue" },
          { label: "Triage" },
        ]}
        title="Triage closed"
        description="Vitals can only be recorded while the patient is waiting in the queue."
      >
        <p className="text-sm text-muted-foreground">
          This patient is now <span className="font-medium">{entry.status.replace(/_/g, " ")}</span>. Return to the
          queue to continue.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/queue">Back to queue</Link>
        </Button>
      </DetailLayout>
    );
  }

  return (
    <DetailLayout
      breadcrumbs={[
        { label: "Dashboard", href: "/" },
        { label: "Queue", href: "/queue" },
        { label: `Position ${entry.position}` },
      ]}
      title="Record vitals"
      description="Capture triage measurements before the doctor starts the consultation."
      actions={
        <Button type="button" variant="outline" onClick={() => router.push("/queue")}>
          Back to queue
        </Button>
      }
    >
      <div className="space-y-6">
        <dl className="grid gap-3 rounded-lg border bg-card p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Patient</dt>
            <dd className="mt-1 font-medium">
              <PatientLink id={entry.patient} />
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Doctor</dt>
            <dd className="mt-1 font-medium">
              <DoctorLabel id={entry.doctor} fullName={entry.doctor_full_name} />
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Queue position</dt>
            <dd className="mt-1 font-medium">{entry.position}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Triage status</dt>
            <dd className="mt-1">
              <TriageStatusBadge entry={entry} />
            </dd>
          </div>
        </dl>

        {canStartTriage && startTriage.isPending ? (
          <p className="text-sm text-muted-foreground">Starting triage…</p>
        ) : null}

        {startTriage.isError ? (
          <p className="text-sm text-destructive">
            {startTriage.error instanceof Error ? startTriage.error.message : "Triage could not be started."}
          </p>
        ) : null}

        {canRecordVitals && entry.encounter ? (
          <VitalsForm
            encounterId={entry.encounter}
            queueEntryId={queueEntryId}
            onSaved={() => {
              void query.refetch();
            }}
          />
        ) : null}

        {entry.vitals_recorded_at ? (
          <p className="text-sm text-success">Vitals are recorded. The doctor can start the consultation when ready.</p>
        ) : null}
      </div>
    </DetailLayout>
  );
}
