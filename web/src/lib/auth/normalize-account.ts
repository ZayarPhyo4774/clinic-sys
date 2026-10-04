import type { Account } from "@/lib/api/types";

export function normalizeAccount(account: Account): Account {
  return {
    id: account.id,
    email: account.email,
    full_name: account.full_name,
    clinic_id: account.clinic_id,
    clinic_timezone: account.clinic_timezone ?? null,
    is_superuser: Boolean(account.is_superuser),
    permissions: account.permissions ?? [],
    has_role_assignments: account.has_role_assignments ?? false,
    requires_branch_selection: account.requires_branch_selection ?? false,
    access_block_reason: account.access_block_reason ?? null,
    resolved_branch_id: account.resolved_branch_id ?? null,
    assigned_branches: account.assigned_branches ?? [],
  };
}
