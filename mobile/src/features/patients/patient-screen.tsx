import { useQuery } from "@tanstack/react-query";

import { RecordList, RowText, StatusRow } from "@/components/record-list";
import { ErrorState, LoadingState } from "@/components/states";
import { Notice } from "@/components/ui";
import { RequirePermission } from "@/features/access/guards";
import { useAuth } from "@/features/auth/auth-provider";
import type { Patient } from "@/lib/api/types";
import { shortId } from "@/lib/format";
import { loadAssignedPatients } from "@/offline/repositories/patient-repository";

export function PatientScreen() {
  return (
    <RequirePermission permission="patients.view" title="Patient">
      <RecordList<Patient>
        title="Patient"
        resource="patients"
        path="/patients/"
        emptyLabel="patients"
        headerExtra={<AssignedPatients />}
        renderItem={(row) => (
          <>
            <RowText label="Number" value={row.patient_number} />
            <RowText label="Name" value={row.full_name} />
            <RowText
              label={row.dob_is_approximate ? "Approx. birth date" : "Date of birth"}
              value={row.dob_is_approximate ? `${row.age} yrs (est.)` : row.date_of_birth}
            />
            <RowText label="Sex" value={row.sex} />
            <StatusRow value={row.is_active ? "active" : "inactive"} />
          </>
        )}
      />
    </RequirePermission>
  );
}

function AssignedPatients() {
  const { account, branchId } = useAuth();
  const query = useQuery({
    queryKey: ["patients", "assigned", branchId, account?.id],
    enabled: Boolean(account?.id),
    queryFn: () => loadAssignedPatients(account?.id ?? "", branchId),
  });

  return (
    <>
      <Notice>Patients for today's appointments and the queue are kept on this device.</Notice>
      {query.isLoading ? <LoadingState /> : null}
      {query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : null}
      {query.data?.notice ? <Notice>{query.data.notice}</Notice> : null}
      {query.data?.patients.map((patient) => (
        <Notice key={patient.id}>
          {`${patient.patient_number} · ${patient.full_name}`}
        </Notice>
      ))}
      {query.data?.unresolved.map((patientId) => (
        <Notice key={patientId}>{`Patient ${shortId(patientId)} is not saved on this device yet.`}</Notice>
      ))}
    </>
  );
}
