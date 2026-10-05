"use client";

import { AlertTriangle, Calendar, ClipboardList, History, Phone } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { StatusText } from "@/components/record-browser";
import { DetailField, DetailGrid, DetailSection, DetailTable } from "@/components/detail-fields";
import { DetailLayout } from "@/components/detail-layout";
import { DetailPageState } from "@/components/detail-page-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { allowed } from "@/features/access/navigation";
import { RequirePermission } from "@/features/access/require-permission";
import { useAuth } from "@/features/auth/auth-provider";
import { PatientVisitHistory } from "@/features/patients/patient-visit-history";
import { PatientWritePanel } from "@/features/patients/patient-writes";
import { useDetailQuery } from "@/hooks/use-detail-query";
import { apiBlob } from "@/lib/api/client";
import type { Patient, PatientProfile } from "@/lib/api/types";
import {
  formatPatientAgeLabel,
  formatPatientBirthSummary,
  formatPatientDobLabel,
  formatSex,
} from "@/lib/patients/age";
import { cn } from "@/lib/utils";

function DownloadDocumentButton({
  patientId,
  documentId,
  fileName,
}: {
  patientId: string;
  documentId: string;
  fileName: string;
}) {
  const [pending, setPending] = useState(false);

  async function download() {
    setPending(true);
    try {
      const blob = await apiBlob(`/patients/${patientId}/documents/${documentId}/file/`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The document could not be downloaded.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => void download()}>
      {pending ? "Downloading…" : "Download"}
    </Button>
  );
}

function primaryContact(profile: PatientProfile) {
  return profile.contacts.find((row) => row.is_primary) ?? profile.contacts[0];
}

function activeAllergies(profile: PatientProfile) {
  return profile.allergies.filter((row) => row.status === "active");
}

function PatientSummary({
  patient,
  profile,
  onVisitHistory,
}: {
  patient: Patient;
  profile: PatientProfile;
  onVisitHistory?: () => void;
}) {
  const contact = primaryContact(profile);
  const allergies = activeAllergies(profile);
  const severeAllergies = allergies.filter((row) => row.severity === "severe");

  return (
    <div className="space-y-4">
      {allergies.length > 0 ? (
        <div
          className={cn(
            "flex items-start gap-3 rounded-xl border px-4 py-3 shadow-premium-sm",
            severeAllergies.length > 0 ? "border-destructive/30 bg-destructive/5" : "border-warning/30 bg-warning/5",
          )}
          role="alert"
        >
          <AlertTriangle
            className={cn("mt-0.5 size-5 shrink-0", severeAllergies.length > 0 ? "text-destructive" : "text-warning-foreground")}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {severeAllergies.length > 0 ? "Severe allergy alert" : "Allergy on file"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {allergies.map((row) => `${row.substance}${row.reaction ? ` (${row.reaction})` : ""}`).join(" · ")}
            </p>
          </div>
        </div>
      ) : null}

      <Card className="shadow-premium-sm">
        <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusText value={patient.is_active ? "active" : "inactive"} />
              <Badge variant="outline">{patient.patient_number}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {formatPatientBirthSummary(patient)} · {formatSex(patient.sex)}
            </p>
            {contact ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="size-4 shrink-0" aria-hidden="true" />
                <span>
                  {contact.kind}: {contact.value}
                  {contact.name ? ` (${contact.name})` : ""}
                </span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">No contact on file</p>
            )}
          </div>
          <PatientQuickActions patientId={patient.id} onVisitHistory={onVisitHistory} />
        </CardContent>
      </Card>
    </div>
  );
}

function PatientQuickActions({ patientId, onVisitHistory }: { patientId: string; onVisitHistory?: () => void }) {
  const { account } = useAuth();
  const permissions = account?.permissions ?? [];
  const actions = [
    {
      label: "Book appointment",
      href: "/appointments",
      permission: "appointments.create",
      icon: Calendar,
      onClick: undefined as (() => void) | undefined,
    },
    {
      label: "Visit history",
      href: "",
      permission: "encounters.view",
      icon: History,
      onClick: onVisitHistory,
    },
    {
      label: "Open visit",
      href: `/patients/${patientId}/consultation`,
      permission: "encounters.view",
      icon: ClipboardList,
      onClick: undefined as (() => void) | undefined,
    },
  ].filter((action) => allowed(permissions, action.permission));

  if (actions.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => {
        const Icon = action.icon;
        if (action.onClick) {
          return (
            <Button key={action.label} type="button" variant="outline" size="sm" onClick={action.onClick}>
              <Icon className="size-4" aria-hidden="true" />
              {action.label}
            </Button>
          );
        }
        return (
          <Button key={action.label} asChild variant="outline" size="sm">
            <Link href={action.href}>
              <Icon className="size-4" aria-hidden="true" />
              {action.label}
            </Link>
          </Button>
        );
      })}
    </div>
  );
}

export function PatientDetailScreen({
  patientId,
  initialTab,
}: {
  patientId: string;
  initialTab?: string;
}) {
  return (
    <RequirePermission permission="patients.view" title="Patient">
      <PatientDetail patientId={patientId} initialTab={initialTab} />
    </RequirePermission>
  );
}

function PatientDetail({ patientId, initialTab }: { patientId: string; initialTab?: string }) {
  const [activeTab, setActiveTab] = useState(initialTab ?? "overview");
  const query = useDetailQuery<PatientProfile>("patients", `/patients/${patientId}/profile/`);
  const state = (
    <DetailPageState
      title="Patient"
      isLoading={query.isLoading}
      error={query.error}
      onRetry={() => void query.refetch()}
    />
  );

  if (query.isLoading || query.error || !query.data) {
    return state;
  }

  const profile = query.data;
  const { patient, contacts, addresses, allergies, medical_history: history, documents } = profile;

  return (
    <DetailLayout
      breadcrumbs={[
        { label: "Dashboard", href: "/" },
        { label: "Patients", href: "/patients" },
        { label: patient.full_name },
      ]}
      title={patient.full_name}
      description={`Patient record ${patient.patient_number}`}
    >
      <PatientSummary
        patient={patient}
        profile={profile}
        onVisitHistory={() => setActiveTab("visits")}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-8">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="visits">Visit history</TabsTrigger>
          <TabsTrigger value="contacts">Contacts & addresses</TabsTrigger>
          <TabsTrigger value="clinical">Conditions & allergies</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="manage">Edit record</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6">
          <DetailSection title="Demographics">
            <DetailGrid>
              <DetailField label="Patient number" value={patient.patient_number} />
              <DetailField
                label={patient.dob_is_approximate ? "Approximate date of birth" : "Date of birth"}
                value={formatPatientDobLabel(patient)}
              />
              <DetailField label="Age" value={formatPatientAgeLabel(patient)} />
              <DetailField label="Sex" value={formatSex(patient.sex)} />
              <DetailField label="Status" value={<StatusText value={patient.is_active ? "active" : "inactive"} />} />
              <DetailField label="Registered" value={new Date(patient.created_at).toLocaleDateString()} />
            </DetailGrid>
          </DetailSection>
        </TabsContent>

        <TabsContent value="visits" className="mt-6 space-y-6">
          <PatientVisitHistory patientId={patient.id} />
        </TabsContent>

        <TabsContent value="contacts" className="mt-6 space-y-6">
          <DetailSection title="Contacts">
            <DetailTable
              emptyLabel="No contacts are recorded."
              rows={contacts}
              columns={[
                { key: "kind", header: "Kind", cell: (row) => String(row.kind) },
                { key: "name", header: "Name", cell: (row) => String(row.name || "—") },
                { key: "value", header: "Value", cell: (row) => String(row.value) },
                {
                  key: "primary",
                  header: "Primary",
                  cell: (row) => (row.is_primary ? "Yes" : "—"),
                },
              ]}
            />
          </DetailSection>

          <DetailSection title="Addresses">
            <DetailTable
              emptyLabel="No addresses are recorded."
              rows={addresses}
              columns={[
                { key: "line1", header: "Line 1", cell: (row) => String(row.line1) },
                { key: "city", header: "City", cell: (row) => String(row.city) },
                { key: "region", header: "Region", cell: (row) => String(row.region ?? "—") },
                { key: "country", header: "Country", cell: (row) => String(row.country) },
                {
                  key: "primary",
                  header: "Primary",
                  cell: (row) => (row.is_primary ? "Yes" : "—"),
                },
              ]}
            />
          </DetailSection>
        </TabsContent>

        <TabsContent value="clinical" className="mt-6 space-y-6">
          <DetailSection title="Allergies">
            <DetailTable
              emptyLabel="No allergies are recorded."
              rows={allergies}
              columns={[
                { key: "substance", header: "Substance", cell: (row) => String(row.substance) },
                { key: "reaction", header: "Reaction", cell: (row) => String(row.reaction ?? "—") },
                {
                  key: "severity",
                  header: "Severity",
                  cell: (row) => <StatusText value={String(row.severity)} />,
                },
                { key: "status", header: "Status", cell: (row) => <StatusText value={String(row.status)} /> },
              ]}
            />
          </DetailSection>

          <DetailSection title="Medical history">
            <DetailTable
              emptyLabel="No medical history is recorded."
              rows={history}
              columns={[
                { key: "title", header: "Title", cell: (row) => String(row.title) },
                { key: "details", header: "Details", cell: (row) => String(row.details ?? "—") },
                { key: "onset", header: "Onset", cell: (row) => String(row.onset_date ?? "—") },
                { key: "status", header: "Status", cell: (row) => <StatusText value={String(row.status)} /> },
              ]}
            />
          </DetailSection>
        </TabsContent>

        <TabsContent value="documents" className="mt-6 space-y-6">
          <DetailSection title="Documents">
            <DetailTable
              emptyLabel="No documents are recorded."
              rows={documents}
              columns={[
                { key: "title", header: "Title", cell: (row) => String(row.title) },
                { key: "type", header: "Type", cell: (row) => String(row.document_type) },
                { key: "file", header: "File", cell: (row) => String(row.file_name) },
                {
                  key: "download",
                  header: "",
                  cell: (row) => (
                    <DownloadDocumentButton
                      patientId={patient.id}
                      documentId={row.id}
                      fileName={row.file_name}
                    />
                  ),
                },
              ]}
            />
          </DetailSection>
        </TabsContent>

        <TabsContent value="manage" className="mt-6 space-y-6">
          <Card className="border-dashed shadow-premium-sm">
            <CardHeader>
              <CardTitle className="text-base">Update patient record</CardTitle>
            </CardHeader>
            <CardContent>
              <PatientWritePanel profile={profile} onUpdated={() => void query.refetch()} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DetailLayout>
  );
}
