"use client";

import { History } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";

import { QueryState, describeError } from "@/components/query-state";
import { StatusText } from "@/components/record-browser";
import { DoctorLabel } from "@/components/record-link";
import { WriteAccordion } from "@/components/write-accordion";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { DetailField, DetailGrid, DetailSection } from "@/components/detail-fields";
import { allowed } from "@/features/access/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import { useDetailQuery } from "@/hooks/use-detail-query";
import { withQuery } from "@/lib/api/client";
import type { Encounter, EncounterHistory, Page } from "@/lib/api/types";
import { formatWhen } from "@/lib/utils";

function visitTitle(encounter: Encounter) {
  const when = formatWhen(encounter.started_at);
  const doctor = encounter.doctor_full_name?.trim();
  return doctor ? `${when} · ${doctor}` : when;
}

function visitDescription(encounter: Encounter) {
  const parts = [encounter.status.replace(/_/g, " ")];
  if (encounter.completed_at) {
    parts.push(`completed ${formatWhen(encounter.completed_at)}`);
  }
  return parts.join(" · ");
}

function summaryList(label: string, items: string[]) {
  if (items.length === 0) {
    return null;
  }
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <ul className="list-inside list-disc space-y-1 text-sm">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function VisitHistoryDetail({ encounterId }: { encounterId: string }) {
  const query = useDetailQuery<EncounterHistory>("encounters", `/encounters/${encounterId}/history/`);

  if (query.isLoading) {
    return <QueryState status="loading" />;
  }
  if (query.isError) {
    return (
      <QueryState status="error" detail={describeError(query.error)} onRetry={() => void query.refetch()} />
    );
  }

  const history = query.data;
  if (!history) {
    return <p className="text-sm text-muted-foreground">Visit details are unavailable.</p>;
  }

  const diagnoses = history.diagnoses.map((row) =>
    row.code ? `${row.code} ${row.description}`.trim() : row.description,
  );
  const symptoms = history.symptoms.map((row) => row.description);
  const plans = history.treatment_plans.map((row) =>
    row.title ? `${row.title}${row.details ? `: ${row.details}` : ""}` : row.details,
  );
  const meta = history.consultation_meta;

  return (
    <div className="space-y-4">
      <DetailGrid>
        <DetailField label="Visit status" value={<StatusText value={history.encounter.status} />} />
        <DetailField
          label="Doctor"
          value={<DoctorLabel id={history.encounter.doctor} fullName={history.encounter.doctor_full_name} />}
        />
      </DetailGrid>

      {summaryList("Symptoms", symptoms)}
      {summaryList("Diagnoses", diagnoses)}
      {summaryList("Treatment plans", plans)}

      {meta?.treatment ? (
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Treatment (CCR)</p>
          <p className="text-sm">{meta.treatment}</p>
        </div>
      ) : null}

      {meta?.remark ? (
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Remark</p>
          <p className="text-sm">{meta.remark}</p>
        </div>
      ) : null}

      {history.notes.length > 0 ? summaryList("Notes", history.notes.map((row) => row.body)) : null}

      <Button asChild size="sm" variant="outline">
        <Link href={`/consultation/${encounterId}`}>Open full consultation record</Link>
      </Button>
    </div>
  );
}

export function PatientVisitHistorySheet({
  patientId,
  trigger,
}: {
  patientId: string;
  trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="outline" size="sm">
            <History className="mr-2 size-4" aria-hidden="true" />
            Visit history
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="left-auto right-0 w-full max-w-2xl overflow-y-auto border-l border-r-0 p-6">
        <SheetTitle className="mb-4">Visit history</SheetTitle>
        <PatientVisitHistory patientId={patientId} />
      </SheetContent>
    </Sheet>
  );
}

export function PatientVisitHistory({ patientId }: { patientId: string }) {
  const { account } = useAuth();
  const canView = Boolean(account && allowed(account.permissions, "encounters.view"));
  const query = useDetailQuery<Page<Encounter>>(
    "encounters",
    canView
      ? withQuery("/encounters/", {
          patient: patientId,
          page_size: "50",
          ordering: "-started_at",
        })
      : null,
  );

  const encounters = useMemo(() => query.data?.results ?? [], [query.data?.results]);

  if (!canView) {
    return (
      <p className="text-sm text-muted-foreground">
        Your role needs encounters.view to read past consultation records.
      </p>
    );
  }

  if (query.isLoading) {
    return <QueryState status="loading" />;
  }

  if (query.isError) {
    return (
      <QueryState status="error" detail={describeError(query.error)} onRetry={() => void query.refetch()} />
    );
  }

  if (encounters.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No consultation visits recorded yet. After the first visit is started, it will appear here.
      </p>
    );
  }

  return (
    <DetailSection title="Consultation visits">
      <p className="mb-4 text-sm text-muted-foreground">
        Past visits for this patient, newest first. Expand a visit to review symptoms, diagnoses, and treatment
        before the next consultation.
      </p>
      <WriteAccordion
        defaultSectionId={encounters[0]?.id}
        sections={encounters.map((encounter) => ({
          id: encounter.id,
          title: visitTitle(encounter),
          description: visitDescription(encounter),
          content: <VisitHistoryDetail encounterId={encounter.id} />,
        }))}
      />
    </DetailSection>
  );
}
