"use client";

import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import Link from "next/link";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AssignedBranchSelect } from "@/components/assigned-branch-select";
import { allowed } from "@/features/access/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import { withQuery } from "@/lib/api/client";
import type { Branch } from "@/lib/api/types";
import { shortId } from "@/lib/utils";
import { loadCachedPage } from "@/offline/repositories/read-repository";

const NO_BRANCH = "__none__";

export function BranchIndicator({ compact = false }: { compact?: boolean }) {
  const { account, branchId, setBranchId } = useAuth();
  const canViewBranches = Boolean(account && allowed(account.permissions, "branches.view"));
  const assignedBranches = account?.assigned_branches ?? [];
  const useAssignedOnly = Boolean(account && assignedBranches.length > 0);

  const branches = useQuery({
    queryKey: ["branches", branchId],
    enabled: Boolean(account) && canViewBranches,
    queryFn: () =>
      loadCachedPage<Branch>({
        path: withQuery("/branches/", { page_size: "100" }),
        userId: account?.id ?? null,
        branchId,
      }),
  });

  if (useAssignedOnly) {
    return <AssignedBranchSelect compact={compact} />;
  }

  if (!canViewBranches) {
    return (
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Branch</p>
        {branchId ? (
          <p className="truncate text-sm" title={branchId}>
            {shortId(branchId)}
          </p>
        ) : (
          <Link href="/settings" className="text-sm text-muted-foreground hover:text-foreground">
            No branch selected
          </Link>
        )}
      </div>
    );
  }

  const results = branches.data?.page.results ?? [];
  const selected = results.find((branch) => branch.id === branchId);

  return (
    <div className="space-y-1">
      {!compact ? <p className="text-xs font-medium text-muted-foreground">Branch</p> : null}
      <Select
        value={branchId ?? NO_BRANCH}
        onValueChange={(value) => setBranchId(value === NO_BRANCH ? null : value)}
        disabled={branches.isLoading}
      >
        <SelectTrigger className={compact ? "h-8 w-full text-xs" : "w-full"} size="sm">
          <MapPin className="size-3 shrink-0 opacity-70" aria-hidden="true" />
          <SelectValue placeholder={branches.isLoading ? "Loading…" : "Select branch"}>
            {selected ? `${selected.name} (${selected.code})` : "No branch selected"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_BRANCH}>No branch selected</SelectItem>
          {results.map((branch) => (
            <SelectItem key={branch.id} value={branch.id}>
              {branch.name} ({branch.code}){branch.is_active ? "" : " · inactive"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!branchId ? (
        <Link href="/settings" className="text-xs text-muted-foreground hover:text-foreground">
          Configure in Settings
        </Link>
      ) : null}
    </div>
  );
}
