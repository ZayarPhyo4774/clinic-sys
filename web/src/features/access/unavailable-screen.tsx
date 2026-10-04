"use client";

import { RequirePermission } from "@/features/access/require-permission";
import { QueryState } from "@/components/query-state";

export function UnavailableScreen({
  title,
  permission,
}: {
  title: string;
  permission: string;
}) {
  return (
    <RequirePermission permission={permission} title={title}>
      <QueryState status="unavailable" title={title} />
    </RequirePermission>
  );
}
