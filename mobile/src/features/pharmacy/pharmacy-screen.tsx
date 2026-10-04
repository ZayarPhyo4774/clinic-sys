import { RecordList, RowText, StatusRow } from "@/components/record-list";
import { RequirePermission } from "@/features/access/guards";
import type { Medicine } from "@/lib/api/types";

export function PharmacyScreen() {
  return (
    <RequirePermission permission="pharmacy.view" title="Pharmacy">
      <RecordList<Medicine>
        title="Medicines"
        resource="medicines"
        path="/medicines/"
        emptyLabel="medicines"
        renderItem={(row) => (
          <>
            <RowText label="Name" value={row.name} />
            <RowText label="Code" value={row.code} />
            <RowText label="Available" value={String(row.available_quantity)} />
            <StatusRow value={row.is_active ? "active" : "inactive"} />
          </>
        )}
      />
    </RequirePermission>
  );
}
