import { RecordList, RowText, StatusRow } from "@/components/record-list";
import { Notice } from "@/components/ui";
import { RequirePermission } from "@/features/access/guards";
import type { Appointment } from "@/lib/api/types";
import { formatWhen, localCalendarDate, shortId } from "@/lib/format";

export function AppointmentScreen({ today }: { today?: boolean }) {
  const date = today ? localCalendarDate() : undefined;
  return (
    <RequirePermission permission="appointments.view" title="Appointments">
      <RecordList<Appointment>
        title={today ? "Today's appointments" : "Appointments"}
        resource={today ? "appointments-today" : "appointments"}
        path="/appointments/"
        extraParams={date ? { date } : undefined}
        emptyLabel="appointments"
        headerExtra={
          today ? <Notice>The clinic API treats this date in the clinic timezone.</Notice> : undefined
        }
        renderItem={(row) => (
          <>
            <StatusRow value={row.status} />
            <RowText label="Starts" value={formatWhen(row.starts_at)} />
            <RowText label="Ends" value={formatWhen(row.ends_at)} />
            <RowText label="Patient" value={shortId(row.patient)} />
            <RowText label="Doctor" value={shortId(row.doctor)} />
            <RowText label="Reason" value={row.visit_reason} />
          </>
        )}
      />
    </RequirePermission>
  );
}
