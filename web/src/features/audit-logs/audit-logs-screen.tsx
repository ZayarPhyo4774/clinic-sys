"use client";

import { FormEvent, useState } from "react";

import { RecordBrowser } from "@/components/record-browser";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RequirePermission } from "@/features/access/require-permission";
import { formatWhen } from "@/lib/utils";

type AuditEvent = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  actor_email: string | null;
  branch_id: string | null;
  ip_address: string | null;
  created_at: string;
};

export function AuditLogsScreen() {
  const [draftAction, setDraftAction] = useState("");
  const [draftEntityType, setDraftEntityType] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");

  function onApplyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAction(draftAction.trim());
    setEntityType(draftEntityType.trim());
  }

  return (
    <RequirePermission permission="audit.view" title="Audit Logs">
      <RecordBrowser<AuditEvent>
        title="Audit Logs"
        description="Read-only record of actions taken in your clinic."
        resource="audit-events"
        path="/audit-events/"
        emptyLabel="audit events"
        listParams={{
          action: action || undefined,
          entity_type: entityType || undefined,
        }}
        toolbar={
          <form className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]" onSubmit={onApplyFilters}>
            <div className="space-y-2">
              <Label htmlFor="audit_action">Action contains</Label>
              <Input
                id="audit_action"
                value={draftAction}
                placeholder="e.g. admin.user_updated"
                onChange={(event) => setDraftAction(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="audit_entity">Entity type contains</Label>
              <Input
                id="audit_entity"
                value={draftEntityType}
                placeholder="e.g. accounts.User"
                onChange={(event) => setDraftEntityType(event.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button type="submit">Apply filters</Button>
            </div>
          </form>
        }
        columns={[
          { key: "when", header: "When", cell: (row) => formatWhen(row.created_at) },
          { key: "action", header: "Action", cell: (row) => row.action },
          { key: "entity", header: "Entity", cell: (row) => row.entity_type },
          { key: "actor", header: "Actor", cell: (row) => row.actor_email || "—" },
          { key: "ip", header: "IP", cell: (row) => row.ip_address || "—" },
        ]}
      />
    </RequirePermission>
  );
}
