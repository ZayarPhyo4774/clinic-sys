"use client";

import { MapPin } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/features/auth/auth-provider";

const NO_BRANCH = "__none__";

export function AssignedBranchSelect({
  compact = false,
  id,
}: {
  compact?: boolean;
  id?: string;
}) {
  const { account, branchId, setBranchId } = useAuth();
  const branches = account?.assigned_branches ?? [];
  const selected = branches.find((branch) => branch.id === branchId);

  if (branches.length === 0) {
    return null;
  }

  return (
    <div className="space-y-1">
      {!compact ? <p className="text-xs font-medium text-muted-foreground">Branch</p> : null}
      <Select
        value={branchId ?? NO_BRANCH}
        onValueChange={(value) => setBranchId(value === NO_BRANCH ? null : value)}
      >
        <SelectTrigger id={id} className={compact ? "h-8 w-full text-xs" : "w-full"} size="sm">
          <MapPin className="size-3 shrink-0 opacity-70" aria-hidden="true" />
          <SelectValue placeholder="Select branch">
            {selected ? `${selected.name} (${selected.code})` : "Select branch"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {branches.map((branch) => (
            <SelectItem key={branch.id} value={branch.id}>
              {branch.name} ({branch.code})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
