"use client";

import Link from "next/link";

import { AssignedBranchSelect } from "@/components/assigned-branch-select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { allowed } from "@/features/access/navigation";
import { useAuth } from "@/features/auth/auth-provider";

export function BranchReminder() {
  const { account, branchId } = useAuth();
  const permissions = account?.permissions ?? [];
  const canViewBranches = allowed(permissions, "branches.view");

  if (!account || branchId) {
    return null;
  }

  if (account.requires_branch_selection) {
    return (
      <Alert>
        <AlertTitle>Select a branch to continue</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>
            Your role applies to a specific branch. Choose one below to load your permissions and clinic modules.
          </p>
          <AssignedBranchSelect />
        </AlertDescription>
      </Alert>
    );
  }

  if (!canViewBranches) {
    return null;
  }

  return (
    <Alert>
      <AlertTitle>Select a branch</AlertTitle>
      <AlertDescription>
        Many clinic permissions apply only after you choose a branch. Open{" "}
        <Link href="/settings" className="font-medium text-primary hover:underline">
          Settings
        </Link>{" "}
        or use the branch selector in the sidebar.
      </AlertDescription>
    </Alert>
  );
}
